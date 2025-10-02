/**
 * Mock Data Generator for KTG Dashboard
 */

const MockData = {
    // Patient information
    patient: {
        name: 'Милюкова Мария Ивановна',
        weeks: 28,
        wellbeingIndex: 95
    },

    // Events data with start and end minutes
    events: [
        { 
            name: 'АКЦЕЛЕРАЦИЯ', 
            startMinute: 5, 
            endMinute: 5.5,
            displayTime: '5 - 5.5'
        },
        { 
            name: 'СХВАТКА', 
            startMinute: 8.33, 
            endMinute: 10,
            displayTime: '8 - 10'
        },
        { 
            name: 'АКЦЕЛЕРАЦИЯ', 
            startMinute: 10, 
            endMinute: 10.5,
            displayTime: '10 - 10.5'
        },
        { 
            name: 'СХВАТКА', 
            startMinute: 20, 
            endMinute: 22,
            displayTime: '20 - 22'
        },
        { 
            name: 'АКЦЕЛЕРАЦИЯ', 
            startMinute: 30, 
            endMinute: 30.5,
            displayTime: '30 - 30.5'
        },
        { 
            name: 'СХВАТКА', 
            startMinute: 33.33, 
            endMinute: 35.5,
            displayTime: '33 - 35'
        },
        { 
            name: 'ДЕЦЕЛЕРАЦИЯ', 
            startMinute: 45, 
            endMinute: 46,
            displayTime: '45 - 46'
        },
        { 
            name: 'СХВАТКА', 
            startMinute: 50, 
            endMinute: 52,
            displayTime: '50 - 52'
        },
        { 
            name: 'АКЦЕЛЕРАЦИЯ', 
            startMinute: 60, 
            endMinute: 60.5,
            displayTime: '60 - 60.5'
        }
    ],

    // Generate 3 hours of CTG data
    generateCTGData() {
        const duration = 180; // 3 hours in minutes
        const pointsPerMinute = 10; // 10 points per minute for smooth curves
        const totalPoints = duration * pointsPerMinute;
        
        const data = {
            labels: [],
            fhr: [], // Fetal Heart Rate (ЧСС)
            ua: [],  // Uterine Activity (СДМ)
            timestamps: []
        };

        // Generate timestamps
        const startTime = new Date('2024-01-01T14:00:00');
        
        // FHR baseline and variability
        const fhrBaseline = 135;
        
        for (let i = 0; i < totalPoints; i++) {
            const minutes = i / pointsPerMinute;
            data.labels.push(minutes);
            
            const currentTime = new Date(startTime.getTime() + minutes * 60000);
            data.timestamps.push(currentTime);

            // Generate FHR with normal variability
            let fhrDelta = this.normalRandom(0, 5); // Base variability
            
            // Add accelerations based on events
            for (const event of this.events) {
                if (event.name === 'АКЦЕЛЕРАЦИЯ') {
                    if (minutes >= event.startMinute && minutes < event.endMinute) {
                        const t = (minutes - event.startMinute) / (event.endMinute - event.startMinute);
                        fhrDelta += 20 * Math.sin(t * Math.PI);
                    }
                } else if (event.name === 'ДЕЦЕЛЕРАЦИЯ') {
                    if (minutes >= event.startMinute && minutes < event.endMinute) {
                        const t = (minutes - event.startMinute) / (event.endMinute - event.startMinute);
                        fhrDelta -= 25 * Math.sin(t * Math.PI);
                    }
                }
            }
            
            // Apply FHR value
            let fhrValue = fhrBaseline + fhrDelta;
            
            // Add some sinusoidal variation for realism
            fhrValue += 3 * Math.sin(i * 0.02) + 2 * Math.cos(i * 0.03);
            
            // Clip to reasonable range
            data.fhr.push(Math.max(100, Math.min(180, fhrValue)));

            // Generate Uterine Activity (contractions)
            let uaValue = 0;
            
            // Generate contractions based on events
            for (const event of this.events) {
                if (event.name === 'СХВАТКА') {
                    if (minutes >= event.startMinute && minutes <= event.endMinute) {
                        const t = (minutes - event.startMinute) / (event.endMinute - event.startMinute);
                        uaValue = Math.sin(t * Math.PI) * 80 + 10;
                    }
                }
            }
            
            // Add minimal baseline activity
            if (uaValue === 0) {
                uaValue = Math.max(0, 5 + this.normalRandom(0, 2));
            }
            
            data.ua.push(Math.max(0, Math.min(100, uaValue)));
        }

        return data;
    },

    // Normal distribution random number generator
    normalRandom(mean, stdDev) {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return num * stdDev + mean;
    },

    // Get a window of data (30 minutes by default)
    getDataWindow(fullData, centerMinute, windowSize = 30) {
        const pointsPerMinute = 10;
        const startMinute = Math.max(0, centerMinute - windowSize / 2);
        const endMinute = Math.min(180, startMinute + windowSize);
        
        const startIndex = Math.floor(startMinute * pointsPerMinute);
        const endIndex = Math.floor(endMinute * pointsPerMinute);
        
        return {
            labels: fullData.labels.slice(startIndex, endIndex),
            fhr: fullData.fhr.slice(startIndex, endIndex),
            ua: fullData.ua.slice(startIndex, endIndex),
            timestamps: fullData.timestamps.slice(startIndex, endIndex),
            startMinute,
            endMinute
        };
    },

    // Format time for display
    formatTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = Math.floor(minutes % 60);
        const baseHour = 14; // Starting at 14:00
        const displayHour = baseHour + hours;
        return `${displayHour.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }
};

// Export for use in other modules
window.MockData = MockData;