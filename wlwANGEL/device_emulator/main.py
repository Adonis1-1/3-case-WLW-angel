import csv
import json
import os
import socket
import time

HOST = '127.0.0.1'
PORT = 8081  # Изменен порт, чтобы избежать конфликта с системными ограничениями
SENDING_INTERVAL_SECONDS = 1

DATA_PATH = 'C:/Users/New/..NEW1/Desktop/emulator/ЛЦТ _НПП _ИТЭЛМА_'
DATA_MAX_FILES_TO_LOAD = 100
CSV_FIELDS_SEPARATOR = ','

TEST_DATA = []


def load_test_data():
    result = []
    files_count = 0
    for root, dirs, files in os.walk(DATA_PATH):
        for file in (x for x in files if x.lower().endswith('.csv')):
            base, ctg_type = os.path.split(root)

            # --- ВОТ ЭТА ПРОВЕРКА ---
            if ctg_type not in ['bpm', 'uterus']:
                continue  # Пропускаем этот файл и идем к следующему
            # ------------------------

            base, patient_id = os.path.split(base)
            base, disease_type = os.path.split(base)

            file_path = os.path.join(root, file)
            with open(file_path, newline='') as csvfile:
                rows = []
                csv_reader = csv.reader(csvfile, delimiter=CSV_FIELDS_SEPARATOR)
                for row in (x for x in csv_reader if len(x) == 2):
                    if is_number(row[0]) and is_number(row[1]):
                        rows.append([row[0], row[1]])
                result.append((disease_type, patient_id, ctg_type, rows))
                print(f'File {file_path} successfully loaded')
                files_count += 1
                if files_count >= DATA_MAX_FILES_TO_LOAD:
                    return result
    return result


def read_test_data():
    while True:
        yield from TEST_DATA


def is_number(s):
    try:
        float(s)
        return True
    except ValueError:
        return False


def start_server():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind((HOST, PORT))
        s.listen()
        print(f'Server started {HOST}:{PORT}, sending interval {SENDING_INTERVAL_SECONDS} seconds')
        conn, addr = s.accept()
        with conn:
            for test_data_value in read_test_data():
                try:
                    bpm_files_len = len(test_data_value['bpm'])
                    uterus_files_len = len(test_data_value['uterus'])

                    for i in range(0, min(bpm_files_len, uterus_files_len) - 1):
                        bpm_len = len(test_data_value['bpm'][i])
                        uterus_len = len(test_data_value['uterus'][i])

                        for k in range(0, min(bpm_len, uterus_len) - 1):
                            message = json.dumps({
                                'bpm': [test_data_value['bpm'][i][k][0], test_data_value['bpm'][i][k][1]],
                                'uterus': [test_data_value['uterus'][i][k][0], test_data_value['uterus'][i][k][1]]
                            }).encode('utf-8')
                            print(f'Sending message: {message}')
                            conn.sendall(message + b'\n')
                            time.sleep(SENDING_INTERVAL_SECONDS)

                except Exception as e:
                    print(f"Error: {e}")
                    conn, addr = s.accept()


def transform_data(source_data):
    result = {}

    for disease_type, patient_id, ctg_type, ctg_values in source_data:
        patient = f'{disease_type}_{patient_id}'
        if patient not in result:
            result[patient] = {'disease_type': disease_type, 'patient_id': patient_id, 'bpm': [], 'uterus': []}

        result[patient][ctg_type].append(ctg_values)

    return list(result.values())


if __name__ == '__main__':
    data = load_test_data()
    TEST_DATA = transform_data(data)
    start_server()