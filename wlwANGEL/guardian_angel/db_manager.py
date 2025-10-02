import sqlite3
import threading
import time
import os


class DBManager:
    def __init__(self, db_path=None, flush_interval_seconds=5, max_buffer=50):
        if db_path is None:
            db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'guardian_angel_data.db')
        self.db_path = db_path
        self.flush_interval_seconds = flush_interval_seconds
        self.max_buffer = max_buffer
        self.buffer = []
        self.lock = threading.Lock()
        self._ensure_db()
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._flusher, daemon=True)
        self.thread.start()

    def _ensure_db(self):
        dirpath = os.path.dirname(self.db_path) or '.'
        os.makedirs(dirpath, exist_ok=True)
        conn = self.get_conn()
        try:
            cur = conn.cursor()
            cur.execute('''
            CREATE TABLE IF NOT EXISTS ctg_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts INTEGER,
                bpm_time REAL,
                bpm_value REAL,
                uterus_time REAL,
                uterus_value REAL
            )
            ''')
            conn.commit()
        finally:
            conn.close()

    def add(self, ts, bpm_time, bpm_value, uterus_time, uterus_value):
        with self.lock:
            self.buffer.append((ts, bpm_time, bpm_value, uterus_time, uterus_value))
            if len(self.buffer) >= self.max_buffer:
                self._flush()

    def get(self, limit=50):
        conn = self.get_conn()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, ts, bpm_time, bpm_value, uterus_time, uterus_value FROM ctg_data ORDER BY id DESC LIMIT ?",
            (limit,))
        rows = cur.fetchall()
        conn.close()
        return rows

    def get_conn(self):
        return sqlite3.connect(self.db_path, timeout=10)

    def _flush(self):
        with self.lock:
            if not self.buffer:
                return
            data_to_write = self.buffer[:]
            self.buffer.clear()
        conn = self.get_conn()
        try:
            cur = conn.cursor()
            cur.executemany(
                "INSERT INTO ctg_data (ts, bpm_time, bpm_value, uterus_time, uterus_value) VALUES (?, ?, ?, ?, ?)",
                data_to_write
            )
            conn.commit()
        finally:
            conn.close()

    def _flusher(self):
        while not self.stop_event.is_set():
            time.sleep(self.flush_interval_seconds)
            self._flush()

    def stop(self):
        self.stop_event.set()
        self._flush()
