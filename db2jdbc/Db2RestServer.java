import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class Db2RestServer {

    // ============================================================
    // SERVER CONFIGURATION
    // ============================================================

    private static final String HOST =
            System.getenv().getOrDefault(
                    "JAVA_API_HOST",
                    "127.0.0.1"
            );

    private static final int PORT =
            Integer.parseInt(
                    System.getenv().getOrDefault(
                            "JAVA_API_PORT",
                            "8080"
                    )
            );


    private static final String DB2_URL =
            System.getenv().getOrDefault(
                    "DB2_URL",
                    "jdbc:db2://192.168.200.150:5025/DALLAS9"
            );

    private static final String DB2_USER =
            System.getenv().getOrDefault(
                    "DB2_USER",
                    "IBMUSER"
            );

    private static final String DB2_PASSWORD =
            System.getenv(
                    "DB2_PASSWORD"
            );

    private static final int MAX_ROWS = 50;

    // ============================================================
    // STRICT QUERY SHAPE
    //
    // Node.js generates SQL. Java provides a second security
    // boundary and only permits SELECT against EMPTAB.
    // ============================================================

    private static final Pattern SAFE_SELECT_PATTERN =
            Pattern.compile(
                    "^SELECT\\s+" +
                    "([A-Z0-9_,\\s]+)" +
                    "\\s+FROM\\s+EMPTAB" +
                    "(?:\\s+WHERE\\s+" +
                    "(.+?))?" +
                    "\\s+FETCH\\s+FIRST\\s+" +
                    "(\\d+)" +
                    "\\s+ROWS\\s+ONLY\\s*$",
                    Pattern.CASE_INSENSITIVE
            );

    private static final Pattern SAFE_COLUMN_PATTERN =
            Pattern.compile(
                    "^(EMPID|EMPNAME|EMPMOB)$",
                    Pattern.CASE_INSENSITIVE
            );

    private static final Pattern SAFE_EMP_ID_WHERE =
            Pattern.compile(
                    "^EMPID\\s*=\\s*(\\d+)$",
                    Pattern.CASE_INSENSITIVE
            );

    private static final Pattern SAFE_EMP_NAME_WHERE =
            Pattern.compile(
                    "^UPPER\\s*\\(\\s*EMPNAME\\s*\\)\\s*=\\s*" +
                    "UPPER\\s*\\(\\s*'((?:''|[^'])*)'\\s*\\)$",
                    Pattern.CASE_INSENSITIVE
            );

    private static final Pattern SAFE_EMP_MOB_WHERE =
            Pattern.compile(
                    "^EMPMOB\\s*=\\s*'((?:''|[^'])*)'$",
                    Pattern.CASE_INSENSITIVE
            );

    // ============================================================
    // MAIN
    // ============================================================

    public static void main(String[] args) throws Exception {

        Class.forName("com.ibm.db2.jcc.DB2Driver");

        HttpServer server =
                HttpServer.create(
                        new InetSocketAddress(
                                HOST,
                                PORT
                        ),
                        0
                );

        server.createContext(
                "/health",
                Db2RestServer::handleHealth
        );

        server.createContext(
                "/db2/status",
                Db2RestServer::handleDb2Status
        );

        server.createContext(
                "/query",
                Db2RestServer::handleQuery
        );

        server.setExecutor(
                Executors.newFixedThreadPool(10)
        );

        System.out.println(
                "======================================"
        );

        System.out.println(
                " Db2 REST API"
        );

        System.out.println(
                "======================================"
        );

        System.out.println(
                "Server: http://" +
                        HOST +
                        ":" +
                        PORT
        );

        System.out.println(
                "Db2:    " +
                        DB2_URL
        );

        System.out.println();

        System.out.println(
                "Endpoints:"
        );

        System.out.println(
                "GET  /health"
        );

        System.out.println(
                "GET  /db2/status"
        );

        System.out.println(
                "POST /query"
        );

        System.out.println();

        System.out.println(
                "SELECT ONLY MODE ENABLED"
        );

        System.out.println(
                "Allowed table: EMPTAB"
        );

        System.out.println(
                "======================================"
        );

        server.start();
    }

    // ============================================================
    // BASIC JAVA API HEALTH
    // ============================================================

    private static void handleHealth(
            HttpExchange exchange
    ) throws IOException {

        if (!exchange.getRequestMethod()
                .equalsIgnoreCase("GET")) {

            sendResponse(
                    exchange,
                    405,
                    "{\"success\":false,\"error\":\"GET required\"}"
            );

            return;
        }

        sendResponse(
                exchange,
                200,
                "{"
                        + "\"success\":true,"
                        + "\"service\":\"Db2 REST API\","
                        + "\"status\":\"UP\","
                        + "\"checkedAt\":\""
                        + escapeJson(
                                java.time.Instant.now()
                                        .toString()
                        )
                        + "\""
                        + "}"
        );
    }

    // ============================================================
    // REAL DB2/JDBC/DDF HEALTH CHECK
    // ============================================================

    private static void handleDb2Status(
            HttpExchange exchange
    ) throws IOException {

        if (!exchange.getRequestMethod()
                .equalsIgnoreCase("GET")) {

            sendResponse(
                    exchange,
                    405,
                    "{\"success\":false,\"error\":\"GET required\"}"
            );

            return;
        }

        long startTime =
                System.currentTimeMillis();

        try {

            requireDb2Password();

            try (
                    Connection connection =
                            DriverManager.getConnection(
                                    DB2_URL,
                                    DB2_USER,
                                    DB2_PASSWORD
                            );

                    Statement statement =
                            connection.createStatement();

                    ResultSet resultSet =
                            statement.executeQuery(
                                    "SELECT CURRENT SERVER " +
                                    "FROM SYSIBM.SYSDUMMY1"
                            )
            ) {

                String serverName = null;

                if (resultSet.next()) {
                    serverName =
                            resultSet.getString(1);
                }

                long responseTime =
                        System.currentTimeMillis()
                                - startTime;

                String json =
                        "{"
                                + "\"success\":true,"
                                + "\"status\":\"UP\","
                                + "\"jdbc\":\"UP\","
                                + "\"ddf\":\"UP\","
                                + "\"db2\":\"UP\","
                                + "\"server\":\""
                                + escapeJson(serverName)
                                + "\","
                                + "\"responseTimeMs\":"
                                + responseTime
                                + "}";

                sendResponse(
                        exchange,
                        200,
                        json
                );
            }

        } catch (Exception e) {

            e.printStackTrace();

            String error =
                    escapeJson(
                            e.getMessage()
                    );

            String json =
                    "{"
                            + "\"success\":false,"
                            + "\"status\":\"DOWN\","
                            + "\"jdbc\":\"DOWN\","
                            + "\"ddf\":\"DOWN\","
                            + "\"db2\":\"DOWN\","
                            + "\"server\":null,"
                            + "\"error\":\""
                            + error
                            + "\""
                            + "}";

            sendResponse(
                    exchange,
                    503,
                    json
            );
        }
    }

    // ============================================================
    // QUERY ENDPOINT
    // ============================================================

    private static void handleQuery(
            HttpExchange exchange
    ) throws IOException {

        if (!exchange.getRequestMethod()
                .equalsIgnoreCase("POST")) {

            sendResponse(
                    exchange,
                    405,
                    "{\"success\":false,\"error\":\"POST required\"}"
            );

            return;
        }

        try {

            String body =
                    readBody(exchange);

            String sql =
                    extractSql(body);

            if (
                    sql == null ||
                    sql.trim().isEmpty()
            ) {

                sendResponse(
                        exchange,
                        400,
                        "{\"success\":false,\"error\":\"SQL is required\"}"
                );

                return;
            }

            System.out.println();
            System.out.println(
                    "Incoming SQL:"
            );
            System.out.println(sql);

            // ====================================================
            // SECURITY
            // ====================================================

            if (!isReadOnlyQuery(sql)) {

                System.out.println(
                        "BLOCKED: Query is not an approved SELECT"
                );

                sendResponse(
                        exchange,
                        403,
                        "{"
                                + "\"success\":false,"
                                + "\"error\":\"Only approved SELECT queries against EMPTAB are allowed\""
                                + "}"
                );

                return;
            }

            // ====================================================
            // EXECUTE
            // ====================================================

            String json =
                    executeQuery(sql);

            sendResponse(
                    exchange,
                    200,
                    json
            );

        } catch (Exception e) {

            e.printStackTrace();

            String message =
                    escapeJson(
                            e.getMessage()
                    );

            sendResponse(
                    exchange,
                    500,
                    "{"
                            + "\"success\":false,"
                            + "\"error\":\""
                            + message
                            + "\""
                            + "}"
            );
        }
    }

    // ============================================================
    // STRICT SELECT-ONLY SECURITY
    // ============================================================

    private static boolean isReadOnlyQuery(
            String sql
    ) {

        String normalized =
                sql.trim()
                        .replaceAll("\\s+", " ")
                        .toUpperCase();

        // Never allow multiple statements.
        if (normalized.contains(";")) {
            return false;
        }

        // Must start with SELECT.
        if (!normalized.startsWith("SELECT ")) {
            return false;
        }

        // Block row locking.
        if (normalized.contains(" FOR UPDATE")) {
            return false;
        }

        // Block dangerous SQL keywords.
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

        String padded =
                " " + normalized + " ";

        for (String keyword : blocked) {

            if (padded.contains(keyword)) {
                return false;
            }
        }

        Matcher matcher =
                SAFE_SELECT_PATTERN.matcher(
                        normalized
                );

        if (!matcher.matches()) {
            return false;
        }

        // Validate columns.
        String columnsPart =
                matcher.group(1);

        String[] columns =
                columnsPart.split(",");

        if (columns.length == 0) {
            return false;
        }

        for (String column : columns) {

            String c =
                    column.trim();

            if (!SAFE_COLUMN_PATTERN
                    .matcher(c)
                    .matches()) {

                return false;
            }
        }

        // Validate FETCH FIRST limit.
        int limit;

        try {
            limit =
                    Integer.parseInt(
                            matcher.group(3)
                    );
        } catch (NumberFormatException e) {
            return false;
        }

        if (limit < 1 || limit > MAX_ROWS) {
            return false;
        }

        // Validate optional WHERE.
        String where =
                matcher.group(2);

        if (where == null ||
                where.trim().isEmpty()) {

            return true;
        }

        String cleanWhere =
                where.trim();

        if (
                SAFE_EMP_ID_WHERE
                        .matcher(cleanWhere)
                        .matches()
        ) {
            return true;
        }

        if (
                SAFE_EMP_NAME_WHERE
                        .matcher(cleanWhere)
                        .matches()
        ) {
            return true;
        }

        if (
                SAFE_EMP_MOB_WHERE
                        .matcher(cleanWhere)
                        .matches()
        ) {
            return true;
        }

        return false;
    }

    // ============================================================
    // EXECUTE DB2 QUERY
    // ============================================================

    private static String executeQuery(
            String sql
    ) throws SQLException {

        requireDb2Password();

        StringBuilder json =
                new StringBuilder();

        json.append("{");
        json.append("\"success\":true,");
        json.append("\"rows\":[");

        try (
                Connection connection =
                        DriverManager.getConnection(
                                DB2_URL,
                                DB2_USER,
                                DB2_PASSWORD
                        );

                Statement statement =
                        connection.createStatement()
        ) {

            statement.setMaxRows(
                    MAX_ROWS
            );

            try (
                    ResultSet resultSet =
                            statement.executeQuery(
                                    sql
                            )
            ) {

                ResultSetMetaData metadata =
                        resultSet.getMetaData();

                int columnCount =
                        metadata.getColumnCount();

                boolean firstRow = true;

                while (
                        resultSet.next()
                ) {

                    if (!firstRow) {
                        json.append(",");
                    }

                    firstRow = false;

                    json.append("{");

                    for (
                            int i = 1;
                            i <= columnCount;
                            i++
                    ) {

                        if (i > 1) {
                            json.append(",");
                        }

                        String columnName =
                                metadata.getColumnLabel(i);

                        Object value =
                                resultSet.getObject(i);

                        json.append("\"");

                        json.append(
                                escapeJson(
                                        columnName
                                )
                        );

                        json.append("\":");

                        if (value == null) {

                            json.append(
                                    "null"
                            );

                        } else {

                            json.append("\"");

                            json.append(
                                    escapeJson(
                                            value.toString()
                                    )
                            );

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

    // ============================================================
    // JSON SQL EXTRACTION
    // ============================================================

    private static String extractSql(
            String body
    ) {

        String key =
                "\"sql\"";

        int keyIndex =
                body.indexOf(key);

        if (keyIndex < 0) {
            return null;
        }

        int colon =
                body.indexOf(
                        ":",
                        keyIndex
                );

        if (colon < 0) {
            return null;
        }

        int start =
                body.indexOf(
                        "\"",
                        colon
                );

        if (start < 0) {
            return null;
        }

        StringBuilder value =
                new StringBuilder();

        boolean escaped = false;

        for (
                int i = start + 1;
                i < body.length();
                i++
        ) {

            char c =
                    body.charAt(i);

            if (escaped) {

                if (c == 'n' ||
                        c == 'r') {

                    value.append(" ");

                } else if (c == 't') {

                    value.append(" ");

                } else {

                    value.append(c);
                }

                escaped = false;
                continue;
            }

            if (c == '\\') {
                escaped = true;
                continue;
            }

            if (c == '"') {
                return value.toString();
            }

            value.append(c);
        }

        return null;
    }

    // ============================================================
    // READ REQUEST BODY
    // ============================================================

    private static String readBody(
            HttpExchange exchange
    ) throws IOException {

        InputStream input =
                exchange.getRequestBody();

        return new String(
                input.readAllBytes(),
                StandardCharsets.UTF_8
        );
    }

    // ============================================================
    // SEND RESPONSE
    // ============================================================

    private static void sendResponse(
            HttpExchange exchange,
            int status,
            String response
    ) throws IOException {

        byte[] data =
                response.getBytes(
                        StandardCharsets.UTF_8
                );

        exchange.getResponseHeaders()
                .set(
                        "Content-Type",
                        "application/json; charset=UTF-8"
                );

        exchange.getResponseHeaders()
                .set(
                        "Cache-Control",
                        "no-store, no-cache, must-revalidate"
                );

        exchange.getResponseHeaders()
                .set(
                        "Pragma",
                        "no-cache"
                );

        exchange.getResponseHeaders()
                .set(
                        "Expires",
                        "0"
                );

        exchange.sendResponseHeaders(
                status,
                data.length
        );

        try (
                OutputStream output =
                        exchange.getResponseBody()
        ) {

            output.write(data);
        }
    }

    // ============================================================
    // DB2 PASSWORD CHECK
    // ============================================================

    private static void requireDb2Password() {

        if (
                DB2_PASSWORD == null ||
                DB2_PASSWORD.isBlank()
        ) {

            throw new IllegalStateException(
                    "DB2_PASSWORD environment variable is not set"
            );
        }
    }

    // ============================================================
    // JSON ESCAPING
    // ============================================================

    private static String escapeJson(
            String value
    ) {

        if (value == null) {
            return "";
        }

        return value
                .replace(
                        "\\",
                        "\\\\"
                )
                .replace(
                        "\"",
                        "\\\""
                )
                .replace(
                        "\r",
                        "\\r"
                )
                .replace(
                        "\n",
                        "\\n"
                )
                .replace(
                        "\t",
                        "\\t"
                );
    }
}
