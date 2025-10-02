// API Module for WebSocket Connection
export class ApiConnector {
    constructor() {
        this.ws = null;
        this.reconnectInterval = 5000;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.onMessageCallback = null;
        this.onStatusChangeCallback = null;
    }

    connectWebSocket(onMessageCallback, onStatusChangeCallback) {
        this.onMessageCallback = onMessageCallback;
        this.onStatusChangeCallback = onStatusChangeCallback;
        
        try {
            // For demo purposes, we'll simulate WebSocket connection
            // In production, uncomment the real WebSocket code below
            
            // this.ws = new WebSocket('ws://localhost:8001/ws/dashboard');
            
            // this.ws.onopen = () => {
            //     console.log('WebSocket Connected');
            //     this.reconnectAttempts = 0;
            //     if (this.onStatusChangeCallback) {
            //         this.onStatusChangeCallback('connected');
            //     }
            // };
            
            // this.ws.onmessage = (event) => {
            //     try {
            //         const data = JSON.parse(event.data);
            //         if (this.onMessageCallback) {
            //             this.onMessageCallback(data);
            //         }
            //     } catch (error) {
            //         console.error('Error parsing WebSocket message:', error);
            //     }
            // };
            
            // this.ws.onerror = (error) => {
            //     console.error('WebSocket Error:', error);
            //     if (this.onStatusChangeCallback) {
            //         this.onStatusChangeCallback('error');
            //     }
            // };
            
            // this.ws.onclose = () => {
            //     console.log('WebSocket Disconnected');
            //     if (this.onStatusChangeCallback) {
            //         this.onStatusChangeCallback('disconnected');
            //     }
            //     this.attemptReconnect();
            // };
            
            // Simulate successful connection for demo
            setTimeout(() => {
                if (this.onStatusChangeCallback) {
                    this.onStatusChangeCallback('connected');
                }
            }, 1000);
            
        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            if (this.onStatusChangeCallback) {
                this.onStatusChangeCallback('error');
            }
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            setTimeout(() => {
                this.connectWebSocket(this.onMessageCallback, this.onStatusChangeCallback);
            }, this.reconnectInterval);
        } else {
            console.error('Max reconnection attempts reached');
            if (this.onStatusChangeCallback) {
                this.onStatusChangeCallback('error');
            }
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    sendMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.error('WebSocket is not connected');
        }
    }
}

// Export singleton instance
export const apiConnector = new ApiConnector();