import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.*;
import java.util.concurrent.Executors;

public class Db2RestServer {

    // ==============================
    // SERVER CONFIGURATION
    // ==============================

    private static final String HOST = "127.0.0.1";
    private static final int PORT = 8080;

    // Db2
    private static final String DB2_URL = "jdbc:db2://192.168.100.150:5025/DALLAS9";

    private static final String DB2_USER = "IBMUSER";

    private static final String DB2_PASSWORD = "SYS1";

    // Maximum number of returned rows
    private static final int MAX_ROWS = 50;

    // ==============================
    // MAIN
    // ==============================

    public static void main(String[] args) throws Exception {

        Class.forName("com.ibm.db2.jcc.DB2Driver");

        HttpServer server = HttpServer.create(
                new InetSocketAddress(HOST, PORT),
                0);

        server.createContext("/health", Db2RestServer::handleHealth);
        server.createContext("/query", Db2RestServer::handleQuery);

        server.setExecutor(
                Executors.newFixedThreadPool(10));

        System.out.println("======================================");
        System.out.println(" Db2 REST API");
        System.out.println("======================================");
        System.out.println("Server: http://" + HOST + ":" + PORT);
        System.out.println("Db2:    " + DB2_URL);
        System.out.println();
        System.out.println("Endpoints:");
        System.out.println("GET  /health");
        System.out.println("POST /query");
        System.out.println();
        System.out.println("SELECT ONLY MODE ENABLED");
        System.out.println("======================================");

        server.start();
    }

    // ==============================
    // HEALTH
    // ==============================

    private static void handleHealth(HttpExchange exchange)
            throws IOException {

        if (!exchange.getRequestMethod().equalsIgnoreCase("GET")) {
            sendResponse(
                    exchange,
                    405,
                    "{\"success\":false,\"error\":\"Method not allowed\"}");
            return;
        }

        sendResponse(
                exchange,
                200,
                "{\"success\":true,\"service\":\"Db2 REST API\"}");
    }

    // ==============================
    // QUERY
    // ==============================

    private static void handleQuery(HttpExchange exchange)
            throws IOException {

        if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {

            sendResponse(
                    exchange,
                    405,
                    "{\"success\":false,\"error\":\"POST required\"}");

            return;
        }

        try {

            String body = readBody(exchange);

            String sql = extractSql(body);

            if (sql == null || sql.trim().isEmpty()) {

                sendResponse(
                        exchange,
                        400,
                        "{\"success\":false,\"error\":\"SQL is required\"}");

                return;
            }

            System.out.println();
            System.out.println("Incoming SQL:");
            System.out.println(sql);

            // ==============================
            // SECURITY VALIDATION
            // ==============================

            if (!isReadOnlyQuery(sql)) {

                System.out.println(
                        "BLOCKED: Non SELECT query");

                sendResponse(
                        exchange,
                        403,
                        "{\"success\":false,\"error\":\"Only SELECT queries are allowed\"}");

                return;
            }

            // ==============================
            // EXECUTE
            // ==============================

            String json = executeQuery(sql);

            sendResponse(
                    exchange,
                    200,
                    json);

        } catch (Exception e) {

            e.printStackTrace();

            String message = escapeJson(e.getMessage());

            sendResponse(
                    exchange,
                    500,
                    "{\"success\":false,\"error\":\"" +
                            message +
                            "\"}");
        }
    }

    // ==============================
    // SECURITY
    // ==============================

    private static boolean isReadOnlyQuery(String sql) {

        String normalized = sql.trim()
                .replaceAll("\\s+", " ")
                .toUpperCase();

        // Must begin with SELECT
        if (!normalized.startsWith("SELECT ")) {
            return false;
        }

        // No multiple statements
        if (normalized.contains(";")) {
            return false;
        }

        // Dangerous SQL operations
        String[] blocked = {

                " INSERT ",
                " UPDATE ",
                " DELETE ",
                " MERGE ",
                " DROP ",
                " ALTER ",
                " CREATE ",
                " TRUNCATE ",
                " GRANT ",
                " REVOKE ",
                " CALL ",
                " EXEC ",
                " EXECUTE ",
                " INTO "
        };

        String padded = " " + normalized + " ";

        for (String keyword : blocked) {

            if (padded.contains(keyword)) {
                return false;
            }
        }

        // Block SELECT FOR UPDATE
        if (normalized.contains(" FOR UPDATE")) {
            return false;
        }

        // ==============================
        // TABLE ALLOWLIST
        // ==============================

        // For Phase 2 we only allow EMPTAB.
        //
        // Later we will replace this with
        // your actual list of approved tables.

        if (!containsAllowedTable(normalized)) {
            return false;
        }

        return true;
    }

    private static boolean containsAllowedTable(String sql) {

        return sql.contains("FROM EMPTAB")
                || sql.contains("FROM YOUR_SCHEMA.EMPTAB")
                || sql.contains("JOIN EMPTAB")
                || sql.contains("JOIN YOUR_SCHEMA.EMPTAB");
    }

    // ==============================
    // DB2 QUERY
    // ==============================

    private static String executeQuery(String sql)
            throws SQLException {

        StringBuilder json = new StringBuilder();

        json.append("{");
        json.append("\"success\":true,");
        json.append("\"rows\":[");

        try (
                Connection connection = DriverManager.getConnection(
                        DB2_URL,
                        DB2_USER,
                        DB2_PASSWORD);

                Statement statement = connection.createStatement()) {

            statement.setMaxRows(MAX_ROWS);

            try (
                    ResultSet resultSet = statement.executeQuery(sql)) {

                ResultSetMetaData metadata = resultSet.getMetaData();

                int columnCount = metadata.getColumnCount();

                boolean firstRow = true;

                while (resultSet.next()) {

                    if (!firstRow) {
                        json.append(",");
                    }

                    firstRow = false;

                    json.append("{");

                    for (int i = 1; i <= columnCount; i++) {

                        if (i > 1) {
                            json.append(",");
                        }

                        String columnName = metadata.getColumnLabel(i);

                        Object value = resultSet.getObject(i);

                        json.append("\"");
                        json.append(
                                escapeJson(columnName));
                        json.append("\":");

                        if (value == null) {

                            json.append("null");

                        } else {

                            json.append("\"");
                            json.append(
                                    escapeJson(
                                            value.toString()));
                            json.append("\"");
                        }
                    }

                    json.append("}");
                }
            }
        }

        json.append("]");
        json.append("}");

        return json.toString();
    }

    // ==============================
    // JSON HELPERS
    // ==============================

    private static String extractSql(String body) {

        // Very simple JSON extraction for Phase 2.
        //
        // Example:
        // {"sql":"SELECT ..."}

        String key = "\"sql\"";

        int keyIndex = body.indexOf(key);

        if (keyIndex < 0) {
            return null;
        }

        int colon = body.indexOf(
                ":",
                keyIndex);

        if (colon < 0) {
            return null;
        }

        int start = body.indexOf(
                "\"",
                colon);

        if (start < 0) {
            return null;
        }

        int end = body.indexOf(
                "\"",
                start + 1);

        if (end < 0) {
            return null;
        }

        return body.substring(
                start + 1,
                end)
                .replace("\\\"", "\"")
                .replace("\\n", " ")
                .replace("\\r", " ");
    }

    private static String readBody(
            HttpExchange exchange)
            throws IOException {

        InputStream input = exchange.getRequestBody();

        return new String(
                input.readAllBytes(),
                StandardCharsets.UTF_8);
    }

    private static void sendResponse(
            HttpExchange exchange,
            int status,
            String response)
            throws IOException {

        byte[] data = response.getBytes(
                StandardCharsets.UTF_8);

        exchange.getResponseHeaders()
                .set(
                        "Content-Type",
                        "application/json");

        exchange.sendResponseHeaders(
                status,
                data.length);

        try (OutputStream output = exchange.getResponseBody()) {

            output.write(data);
        }
    }

    private static String escapeJson(
            String value) {

        if (value == null) {
            return "";
        }

        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\r", "\\r")
                .replace("\n", "\\n");
    }
}