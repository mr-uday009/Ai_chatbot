#!/bin/bash
cd /media/psf/Downloads/zOS-V1R11/db2-chatbot
node server.js &
SERVER_PID=$!
sleep 3

echo "=== Testing various queries ==="
echo ""
echo "1. what is the employee id of keerthan"
curl -s -X POST http://127.0.0.1:3001/chat -H "Content-Type: application/json" -d '{"message":"what is the employee id of keerthan"}'
echo ""

echo "2. who is irfan"
curl -s -X POST http://127.0.0.1:3001/chat -H "Content-Type: application/json" -d '{"message":"who is irfan"}'
echo ""

echo "3. delete the uday row"
curl -s -X POST http://127.0.0.1:3001/chat -H "Content-Type: application/json" -d '{"message":"delete the uday row"}'
echo ""

echo "4. what is youtube"
curl -s -X POST http://127.0.0.1:3001/chat -H "Content-Type: application/json" -d '{"message":"what is youtube"}'
echo ""

echo "5. hi"
curl -s -X POST http://127.0.0.1:3001/chat -H "Content-Type: application/json" -d '{"message":"hi"}'
echo ""

echo "6. show me tables"
curl -s -X POST http://127.0.0.1:3001/chat -H "Content-Type: application/json" -d '{"message":"show me tables"}'
echo ""

kill $SERVER_PID