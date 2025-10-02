# client_main.py
import json
import socket
import time
import os
import sys
import asyncio
import websockets

sys.path.append(os.path.dirname(__file__))
from db_manager import DBManager

HOST = '127.0.0.1'
PORT = 65432

def safe_int(x, fallback=None):
    try:
        return int(float(x))
    except Exception:
        return fallback

def safe_float(x, fallback=None):
    try:
        return float(x)
    except Exception:
        return fallback

# WebSocket клиент для отправки данных в API
class WebSocketClient:
    def __init__(self):
        self.websocket = None
        self.is_connected = False
        
    async def connect(self):
        try:
            self.websocket = await websockets.connect('ws://localhost:8000/ws')
            self.is_connected = True
            print("✅ WebSocket connected to API")
            
            # Слушаем сообщения от сервера
            asyncio.create_task(self.listen_messages())
            
        except Exception as e:
            print(f"❌ WebSocket connection failed: {e}")
            self.is_connected = False
            
    async def listen_messages(self):
        try:
            async for message in self.websocket:
                data = json.loads(message)
                if data.get("type") == "pong":
                    print("🏓 Received pong from server")
                elif data.get("type") == "connection":
                    print(f"🔗 {data.get('message')}")
        except Exception as e:
            print(f"Error in WebSocket listener: {e}")
            self.is_connected = False
            
    async def send_data(self, data):
        if self.is_connected and self.websocket:
            try:
                await self.websocket.send(json.dumps(data))
                return True
            except Exception as e:
                print(f"Error sending WebSocket data: {e}")
                self.is_connected = False
                return False
        return False
        
    async def close(self):
        if self.websocket:
            await self.websocket.close()
            self.is_connected = False

# Глобальный WebSocket клиент
ws_client = WebSocketClient()

async def start_receive():
    db = DBManager()
    
    # Подключаемся к WebSocket
    await ws_client.connect()
    
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.connect((HOST, PORT))
        buffer = ''
        print(f"✅ Connected to data server {HOST}:{PORT}")
        
        while True:
            data = s.recv(4096)
            if not data:
                print("❌ Connection closed by server")
                break
                
            buffer += data.decode('utf-8', errors='ignore')
            while '\n' in buffer:
                line, buffer = buffer.split('\n', 1)
                if not line.strip():
                    continue
                    
                try:
                    data_json = json.loads(line)
                    ts = int(time.time())
                    
                    # Извлекаем данные ЧСС и СДМ
                    bpm = data_json.get('bpm', [None, None])
                    uterus = data_json.get('uterus', [None, None])
                    
                    bpm_time = safe_float(bpm[0], fallback=None)
                    bpm_value = safe_float(bpm[1], fallback=None)
                    uterus_time = safe_float(uterus[0], fallback=None)
                    uterus_value = safe_float(uterus[1], fallback=None)
                    
                    # Сохраняем в базу данных
                    db.add(ts, bpm_time, bpm_value, uterus_time, uterus_value)
                    
                    # Подготавливаем данные для WebSocket
                    ws_data = {
                        "type": "ctg_data",
                        "ts": ts,
                        "bpm_value": bpm_value,
                        "uterus_value": uterus_value,
                        "bpm_time": bpm_time,
                        "uterus_time": uterus_time
                    }
                    
                    # Отправляем через WebSocket
                    success = await ws_client.send_data(ws_data)
                    
                    if success:
                        print(f"📨 Sent: FHR={bpm_value}, UA={uterus_value}")
                    else:
                        print(f"💾 Saved: FHR={bpm_value}, UA={uterus_value} (WebSocket offline)")
                        
                except json.JSONDecodeError as e:
                    print(f"❌ JSON decode error: {e}")
                    print(f"Raw data: {line}")
                except Exception as e:
                    print(f"❌ Error processing message: {e}")

async def main():
    try:
        print("🚀 Starting CTG Data Receiver with WebSocket...")
        print("📡 Connecting to:")
        print(f"   • Data Server: {HOST}:{PORT}")
        print(f"   • WebSocket API: ws://localhost:8000/ws")
        print(f"   • Database: {os.path.join(os.getcwd(), 'guardian_angel_data.db')}")
        
        await start_receive()
        
    except KeyboardInterrupt:
        print("\n🛑 Stopping receiver...")
    except Exception as e:
        print(f"❌ Fatal error: {e}")
    finally:
        await ws_client.close()
        print("👋 Receiver stopped")

if __name__ == '__main__':
    # Запускаем асинхронный main
    asyncio.run(main())