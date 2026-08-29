#!/bin/bash
cd /media/psf/Downloads/zOS-V1R11/db2-chatbot
node server.js &
SERVER_PID=$!
sleep 3
echo "Testing who is uday..."
curl -s -X POST http://127.0.0.1:3001/chat -H "Content-Type: application/json" -d '{"message":"who is uday"}'
echo ""
echo "Testing employee uday..."
curl -s -X POST http://127.0.0.1:3001/chat -H "Content-Type: application/json" -d '{"message":"employee uday"}'
echo ""
echo "Testing show all employees..."
curl -s -X POST http://127.0.0.1:3001/chat -H "Content-Type: application/json" -d '{"message":"show all employees"}'
echo ""
echo "Testing system status..."
curl -s -X POST http://127.0.0.1:3001/chat -H "Content-Type: application/json" -d '{"message":"system status"}'
echo ""
kill $SERVER_PID