import json
import socket
import time
import os
import sys
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

def start_receive():
    db = DBManager()
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.connect((HOST, PORT))
        buffer = ''
        while True:
            data = s.recv(4096)
            if not data:
                break
            buffer += data.decode('utf-8', errors='ignore')
            while '\n' in buffer:
                line, buffer = buffer.split('\n', 1)
                if not line.strip():
                    continue
                try:
                    data_json = json.loads(line)
                    ts = int(time.time())
                    bpm = data_json.get('bpm', [None, None])
                    uterus = data_json.get('uterus', [None, None])
                    bpm_time = safe_float(bpm[0], fallback=None)
                    bpm_value = safe_float(bpm[1], fallback=None)
                    uterus_time = safe_float(uterus[0], fallback=None)
                    uterus_value = safe_float(uterus[1], fallback=None)
                    db.add(ts, bpm_time, bpm_value, uterus_time, uterus_value)
                    print(f"Buffered: ts={ts}, bpm_time={bpm_time}, bpm_value={bpm_value}, uterus_time={uterus_time}, uterus_value={uterus_value}")
                except Exception as e:
                    print(f"Error parsing message: {e}")

if __name__ == '__main__':
    start_receive()
