// Mock archive data
const mockArchiveData = [
    {
        
        id: 'archive_001',
        name: 'Соколова Елена Петровна',
        date: '2025-01-24',
        time: '14:30 - 18:45',
        room: '203',
        duration: '4ч 15мин',
        outcome: 'Естественные роды, без осложнений',
        fwbsAverage: 88
    },
    {
        id: 'archive_002',
        name: 'Михайлова Ольга Андреевна',
        date: '2025-01-23',
        time: '09:00 - 16:30',
        room: '305',
        duration: '7ч 30мин',
        outcome: 'Кесарево сечение (плановое)',
        fwbsAverage: 75
    },
    {
        id: 'archive_003',
        name: 'Белова Татьяна Сергеевна',
        date: '2025-01-22',
        time: '20:15 - 03:45',
        room: '201',
        duration: '7ч 30мин',
        outcome: 'Естественные роды, эпизиотомия',
        fwbsAverage: 82
    },
    {
        id: 'archive_004',
        name: 'Новикова Анна Викторовна',
        date: '2025-01-21',
        time: '11:00 - 14:20',
        room: '302',
        duration: '3ч 20мин',
        outcome: 'Естественные роды, быстрые',
        fwbsAverage: 91
    }
];

class ArchiveApp {
    constructor() {
        this.searchResults = [];
    }

    init() {
        console.log('Initializing archive page...');
        this.setupEventListeners();
        this.startClock();
        this.setDefaultDates();
    }

    setupEventListeners() {
        const form = document.getElementById('search-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.performSearch();
            });
        }
    }

    setDefaultDates() {
        // Set default date range (last 7 days)
        const dateFrom = document.getElementById('date-from');
        const dateTo = document.getElementById('date-to');
        
        if (dateTo) {
            dateTo.value = new Date().toISOString().split('T')[0];
        }
        
        if (dateFrom) {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            dateFrom.value = weekAgo.toISOString().split('T')[0];
        }
    }

    performSearch() {
        console.log('Performing search...');
        
        // Get search parameters
        const nameSearch = document.getElementById('patient-name-search').value.toLowerCase();
        const dateFrom = document.getElementById('date-from').value;
        const dateTo = document.getElementById('date-to').value;
        
        // Simulate search delay
        this.showLoadingState();
        
        setTimeout(() => {
            // Filter mock data based on search criteria
            let results = [...mockArchiveData];
            
            if (nameSearch) {
                results = results.filter(item => 
                    item.name.toLowerCase().includes(nameSearch)
                );
            }
            
            if (dateFrom) {
                results = results.filter(item => 
                    item.date >= dateFrom
                );
            }
            
            if (dateTo) {
                results = results.filter(item => 
                    item.date <= dateTo
                );
            }
            
            // Always show at least some results for demo
            if (results.length === 0 && !nameSearch) {
                results = mockArchiveData.slice(0, 2);
            }
            
            this.searchResults = results;
            this.displayResults();
        }, 500);
    }

    showLoadingState() {
        const container = document.getElementById('archive-results');
        container.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p>Поиск записей...</p>
            </div>
        `;
    }

    displayResults() {
        const container = document.getElementById('archive-results');
        const countElement = document.getElementById('results-count');
        
        countElement.textContent = `Найдено: ${this.searchResults.length} записей`;
        
        if (this.searchResults.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <p class="empty-state-text">По вашему запросу ничего не найдено</p>
                    <p class="empty-state-hint">Попробуйте изменить параметры поиска</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.searchResults.map(result => `
            <div class="archive-card">
                <div class="archive-card-header">
                    <div class="archive-patient-info">
                        <h3 class="archive-patient-name">${result.name}</h3>
                        <div class="archive-meta">
                            <span class="meta-item">📅 ${this.formatDate(result.date)}</span>
                            <span class="meta-item">⏱ ${result.time}</span>
                            <span class="meta-item">🏥 Палата ${result.room}</span>
                            <span class="meta-item">⏳ ${result.duration}</span>
                        </div>
                    </div>
                    <div class="archive-score">
                        <div class="score-value ${this.getScoreClass(result.fwbsAverage)}">${result.fwbsAverage}</div>
                        <div class="score-label">Средний FWBS</div>
                    </div>
                </div>
                <div class="archive-card-body">
                    <div class="archive-outcome">
                        <span class="outcome-label">Исход:</span>
                        <span class="outcome-text">${result.outcome}</span>
                    </div>
                </div>
                <div class="archive-card-footer">
<a href="archive-view.html?id=${result.id}" class="btn btn--small btn--primary">
    📊 Просмотреть запись
</a>
                    <button class="btn btn--small btn--secondary" onclick="archiveApp.downloadReport('${result.id}')">
                        📥 Скачать отчет
                    </button>
                </div>
            </div>
        `).join('');
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const options = { day: 'numeric', month: 'long', year: 'numeric' };
        return date.toLocaleDateString('ru-RU', options);
    }

    getScoreClass(score) {
        if (score >= 85) return 'score-normal';
        if (score >= 70) return 'score-warning';
        return 'score-critical';
    }

    clearSearch() {
        document.getElementById('patient-name-search').value = '';
        this.setDefaultDates();
        
        const container = document.getElementById('archive-results');
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <p class="empty-state-text">Используйте форму поиска выше для поиска архивных записей</p>
            </div>
        `;
        
        document.getElementById('results-count').textContent = 'Найдено: 0 записей';
        this.searchResults = [];
    }

async downloadReport(archiveId) {
    console.log('Generating PDF report for:', archiveId);
    
    // Show notification
    this.showNotification('Генерация отчета...', 'info');
    
    // Find the archive data
    const archiveData = this.searchResults.find(item => item.id === archiveId);
    if (!archiveData) {
        this.showNotification('Ошибка: данные не найдены', 'error');
        return;
    }
    
    try {
        // Create a hidden container for the report
        const reportContainer = document.createElement('div');
        reportContainer.id = 'pdf-report-container';
        reportContainer.style.cssText = `
            position: fixed;
            left: -9999px;
            top: 0;
            width: 794px;
            background: white;
            padding: 40px;
            font-family: 'Manrope', sans-serif;
        `;
        
        // Generate CTG data for charts
        const ctgData = this.generateMockCTGData();
        
        // Create report HTML with charts
        reportContainer.innerHTML = `
            <div style="background: white; padding: 20px;">
                <!-- Header -->
                <div style="text-align: center; margin-bottom: 40px;">
                    <h1 style="color: #2C2C3A; font-size: 28px; margin-bottom: 10px;">
                        Медицинский отчет КТГ мониторинга
                    </h1>
                    <div style="color: #6C6C7D; font-size: 14px;">
                        Система мониторинга "Виртуальный раунд"
                    </div>
                </div>
                
                <!-- Patient Info Block -->
                <div style="background: #F4F7FE; padding: 25px; border-radius: 14px; margin-bottom: 30px;">
                    <h2 style="color: #6D63FF; font-size: 18px; margin-bottom: 20px; text-transform: uppercase;">
                        Информация о пациентке
                    </h2>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div>
                            <strong style="color: #6C6C7D; font-size: 12px;">ФИО:</strong>
                            <div style="color: #2C2C3A; font-size: 16px; font-weight: 600;">${archiveData.name}</div>
                        </div>
                        <div>
                            <strong style="color: #6C6C7D; font-size: 12px;">ID ЗАПИСИ:</strong>
                            <div style="color: #2C2C3A; font-size: 16px; font-weight: 600;">${archiveData.id}</div>
                        </div>
                        <div>
                            <strong style="color: #6C6C7D; font-size: 12px;">ДАТА:</strong>
                            <div style="color: #2C2C3A; font-size: 16px; font-weight: 600;">${this.formatDate(archiveData.date)}</div>
                        </div>
                        <div>
                            <strong style="color: #6C6C7D; font-size: 12px;">ПАЛАТА:</strong>
                            <div style="color: #2C2C3A; font-size: 16px; font-weight: 600;">${archiveData.room}</div>
                        </div>
                        <div>
                            <strong style="color: #6C6C7D; font-size: 12px;">ВРЕМЯ МОНИТОРИНГА:</strong>
                            <div style="color: #2C2C3A; font-size: 16px; font-weight: 600;">${archiveData.time}</div>
                        </div>
                        <div>
                            <strong style="color: #6C6C7D; font-size: 12px;">ПРОДОЛЖИТЕЛЬНОСТЬ:</strong>
                            <div style="color: #2C2C3A; font-size: 16px; font-weight: 600;">${archiveData.duration}</div>
                        </div>
                    </div>
                </div>
                
                <!-- FWBS Score Block -->
                <div style="background: #F4F7FE; padding: 25px; border-radius: 14px; margin-bottom: 30px;">
                    <h2 style="color: #6D63FF; font-size: 18px; margin-bottom: 20px; text-transform: uppercase;">
                        Индекс благополучия плода
                    </h2>
                    <div style="display: flex; align-items: center; gap: 30px;">
                        <div style="text-align: center;">
                            <div style="width: 120px; height: 120px; position: relative;">
                                <canvas id="wellbeing-chart" width="120" height="120"></canvas>
                            </div>
                        </div>
                        <div style="flex: 1;">
                            <div style="font-size: 48px; font-weight: 800; color: ${this.getScoreColorHex(archiveData.fwbsAverage)};">
                                ${archiveData.fwbsAverage}
                            </div>
                            <div style="color: #6C6C7D; font-size: 14px; margin-top: 5px;">
                                Средний показатель FWBS
                            </div>
                            <div style="margin-top: 10px; padding: 10px; background: white; border-radius: 8px;">
                                <strong>Интерпретация:</strong> ${this.getScoreInterpretation(archiveData.fwbsAverage)}
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- CTG Charts Block -->
                <div style="background: #F4F7FE; padding: 25px; border-radius: 14px; margin-bottom: 30px;">
                    <h2 style="color: #6D63FF; font-size: 18px; margin-bottom: 20px; text-transform: uppercase;">
                        Кардиотокография (КТГ)
                    </h2>
                    
                    <!-- FHR Chart -->
                    <div style="background: white; border-radius: 10px; padding: 15px; margin-bottom: 15px;">
                        <div style="color: #6C6C7D; font-size: 12px; margin-bottom: 10px;">ЧСС ПЛОДА (уд/мин)</div>
                        <canvas id="fhr-chart" width="700" height="150"></canvas>
                    </div>
                    
                    <!-- UA Chart -->
                    <div style="background: white; border-radius: 10px; padding: 15px;">
                        <div style="color: #6C6C7D; font-size: 12px; margin-bottom: 10px;">МАТОЧНАЯ АКТИВНОСТЬ (отн.ед)</div>
                        <canvas id="ua-chart" width="700" height="100"></canvas>
                    </div>
                </div>
                
                <!-- Results Block -->
                <div style="background: #F4F7FE; padding: 25px; border-radius: 14px; margin-bottom: 30px;">
                    <h2 style="color: #6D63FF; font-size: 18px; margin-bottom: 20px; text-transform: uppercase;">
                        Результаты и исход
                    </h2>
                    <div style="padding: 15px; background: white; border-radius: 8px;">
                        <strong>Исход родов:</strong> ${archiveData.outcome}
                    </div>
                </div>
                
                <!-- Recommendations Block -->
                <div style="background: #F4F7FE; padding: 25px; border-radius: 14px; margin-bottom: 30px;">
                    <h2 style="color: #6D63FF; font-size: 18px; margin-bottom: 20px; text-transform: uppercase;">
                        Рекомендации
                    </h2>
                    <div style="padding: 15px; background: white; border-radius: 8px; line-height: 1.6;">
                        ${this.getRecommendations(archiveData.fwbsAverage)}
                    </div>
                </div>
                
                <!-- Footer -->
                <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #F0F0F3;">
                    <div style="color: #9A9AAB; font-size: 12px;">
                        Отчет сгенерирован: ${new Date().toLocaleString('ru-RU')}
                    </div>
                    <div style="color: #9A9AAB; font-size: 12px; margin-top: 5px;">
                        Система мониторинга КТГ "Виртуальный раунд"
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(reportContainer);
        
        // Create charts
        await this.createChartsForPDF(archiveData.fwbsAverage, ctgData);
        
        // Wait for charts to render
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Generate PDF using html2canvas and jsPDF
        const canvas = await html2canvas(reportContainer, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });
        
        const imgData = canvas.toDataURL('image/png');
        const pdf = new window.jspdf.jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;
        
        // Add first page
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        
        // Add additional pages if needed
        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }
        
        // Save PDF
        const fileName = `КТГ_отчет_${archiveData.name.replace(/\s+/g, '_')}_${archiveData.date}.pdf`;
        pdf.save(fileName);
        
        // Clean up
        document.body.removeChild(reportContainer);
        
        // Show success notification
        this.showNotification('Отчет успешно сохранен!', 'success');
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        this.showNotification('Ошибка при создании отчета', 'error');
    }
}

// Helper function to create charts for PDF
async createChartsForPDF(fwbsScore, ctgData) {
    // Create wellbeing chart
    const wellbeingCtx = document.getElementById('wellbeing-chart').getContext('2d');
    new Chart(wellbeingCtx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [fwbsScore, 100 - fwbsScore],
                backgroundColor: [this.getScoreColorHex(fwbsScore), '#F0F0F3'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: true,
            cutout: '75%',
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        },
        plugins: [{
            id: 'centerText',
            afterDraw: function(chart) {
                const ctx = chart.ctx;
                ctx.save();
                const centerX = chart.width / 2;
                const centerY = chart.height / 2;
                ctx.font = 'bold 36px Manrope';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#2C2C3A';
                ctx.fillText(fwbsScore, centerX, centerY);
                ctx.restore();
            }
        }]
    });
    
    // Create FHR chart
    const fhrCtx = document.getElementById('fhr-chart').getContext('2d');
    new Chart(fhrCtx, {
        type: 'line',
        data: {
            labels: ctgData.labels,
            datasets: [{
                label: 'ЧСС',
                data: ctgData.fhr,
                borderColor: '#FF1744',
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.15
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: 50,
                    max: 210,
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                x: {
                    grid: { color: 'rgba(0,0,0,0.05)' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
    
    // Create UA chart
    const uaCtx = document.getElementById('ua-chart').getContext('2d');
    new Chart(uaCtx, {
        type: 'line',
        data: {
            labels: ctgData.labels,
            datasets: [{
                label: 'СДМ',
                data: ctgData.ua,
                borderColor: '#0D47A1',
                backgroundColor: 'rgba(13, 71, 161, 0.1)',
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.15,
                fill: true
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                x: {
                    grid: { color: 'rgba(0,0,0,0.05)' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

// Обновленная функция генерации данных КТГ (сокращенная)
generateMockCTGData() {
    const dataPoints = 30; // Сократили с 60 до 30 точек
    const data = {
        labels: [],
        fhr: [],
        ua: []
    };
    
    for (let i = 0; i < dataPoints; i++) {
        // Метки времени каждые 2 минуты вместо каждой минуты
        data.labels.push((i * 2) + ' мин');
        
        // Generate FHR data (baseline around 140)
        const fhrBase = 140;
        const fhrVariation = Math.sin(i * 0.1) * 10 + Math.random() * 5 - 2.5;
        data.fhr.push(Math.round(fhrBase + fhrVariation));
        
        // Generate UA data (contractions)
        let uaValue = 5 + Math.random() * 5;
        if (i % 15 === 0 || i % 15 === 1 || i % 15 === 2) {
            uaValue = 40 + Math.random() * 20;
        }
        data.ua.push(Math.round(uaValue));
    }
    
    return data;
}

// Обновленная функция downloadReport
async downloadReport(archiveId) {
    console.log('Generating PDF report for:', archiveId);
    
    // Show notification
    this.showNotification('Генерация отчета...', 'info');
    
    // Find the archive data
    const archiveData = this.searchResults.find(item => item.id === archiveId);
    if (!archiveData) {
        this.showNotification('Ошибка: данные не найдены', 'error');
        return;
    }
    
    try {
        // Create a hidden container for the report
        const reportContainer = document.createElement('div');
        reportContainer.id = 'pdf-report-container';
        reportContainer.style.cssText = `
            position: fixed;
            left: -9999px;
            top: 0;
            width: 794px;
            background: white;
            padding: 40px;
            font-family: 'Manrope', sans-serif;
        `;
        
        // Generate CTG data for charts (сокращенные данные)
        const ctgData = this.generateMockCTGData();
        
        // Create report HTML with charts (БЕЗ рекомендаций и с уменьшенными графиками)
        reportContainer.innerHTML = `
            <div style="background: white; padding: 20px;">
                <!-- Header -->
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #2C2C3A; font-size: 26px; margin-bottom: 10px;">
                        Медицинский отчет КТГ мониторинга
                    </h1>
                    <div style="color: #6C6C7D; font-size: 14px;">
                        Система мониторинга "Виртуальный раунд"
                    </div>
                </div>
                
                <!-- Patient Info Block -->
                <div style="background: #F4F7FE; padding: 20px; border-radius: 14px; margin-bottom: 25px;">
                    <h2 style="color: #6D63FF; font-size: 16px; margin-bottom: 15px; text-transform: uppercase;">
                        Информация о пациентке
                    </h2>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <strong style="color: #6C6C7D; font-size: 11px;">ФИО:</strong>
                            <div style="color: #2C2C3A; font-size: 14px; font-weight: 600;">${archiveData.name}</div>
                        </div>
                        <div>
                            <strong style="color: #6C6C7D; font-size: 11px;">ID ЗАПИСИ:</strong>
                            <div style="color: #2C2C3A; font-size: 14px; font-weight: 600;">${archiveData.id}</div>
                        </div>
                        <div>
                            <strong style="color: #6C6C7D; font-size: 11px;">ДАТА:</strong>
                            <div style="color: #2C2C3A; font-size: 14px; font-weight: 600;">${this.formatDate(archiveData.date)}</div>
                        </div>
                        <div>
                            <strong style="color: #6C6C7D; font-size: 11px;">ПАЛАТА:</strong>
                            <div style="color: #2C2C3A; font-size: 14px; font-weight: 600;">${archiveData.room}</div>
                        </div>
                        <div>
                            <strong style="color: #6C6C7D; font-size: 11px;">ВРЕМЯ МОНИТОРИНГА:</strong>
                            <div style="color: #2C2C3A; font-size: 14px; font-weight: 600;">${archiveData.time}</div>
                        </div>
                        <div>
                            <strong style="color: #6C6C7D; font-size: 11px;">ПРОДОЛЖИТЕЛЬНОСТЬ:</strong>
                            <div style="color: #2C2C3A; font-size: 14px; font-weight: 600;">${archiveData.duration}</div>
                        </div>
                    </div>
                </div>
                
                <!-- FWBS Score Block -->
                <div style="background: #F4F7FE; padding: 20px; border-radius: 14px; margin-bottom: 25px;">
                    <h2 style="color: #6D63FF; font-size: 16px; margin-bottom: 15px; text-transform: uppercase;">
                        Индекс благополучия плода
                    </h2>
                    <div style="display: flex; align-items: center; gap: 25px;">
                        <div style="text-align: center;">
                            <div style="width: 100px; height: 100px; position: relative;">
                                <canvas id="wellbeing-chart" width="100" height="100"></canvas>
                            </div>
                        </div>
                        <div style="flex: 1;">
                            <div style="font-size: 42px; font-weight: 800; color: ${this.getScoreColorHex(archiveData.fwbsAverage)};">
                                ${archiveData.fwbsAverage}
                            </div>
                            <div style="color: #6C6C7D; font-size: 13px; margin-top: 5px;">
                                Средний показатель FWBS
                            </div>
                            <div style="margin-top: 10px; padding: 8px; background: white; border-radius: 8px; font-size: 13px;">
                                <strong>Интерпретация:</strong> ${this.getScoreInterpretation(archiveData.fwbsAverage)}
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- CTG Charts Block (уменьшенные графики) -->
                <div style="background: #F4F7FE; padding: 20px; border-radius: 14px; margin-bottom: 25px;">
                    <h2 style="color: #6D63FF; font-size: 16px; margin-bottom: 15px; text-transform: uppercase;">
                        Кардиотокография (КТГ)
                    </h2>
                    
                    <!-- FHR Chart (уменьшенная ширина) -->
                    <div style="background: white; border-radius: 10px; padding: 12px; margin-bottom: 12px;">
                        <div style="color: #6C6C7D; font-size: 11px; margin-bottom: 8px;">ЧСС ПЛОДА (уд/мин)</div>
                        <canvas id="fhr-chart" width="500" height="120"></canvas>
                    </div>
                    
                    <!-- UA Chart (уменьшенная ширина) -->
                    <div style="background: white; border-radius: 10px; padding: 12px;">
                        <div style="color: #6C6C7D; font-size: 11px; margin-bottom: 8px;">МАТОЧНАЯ АКТИВНОСТЬ (отн.ед)</div>
                        <canvas id="ua-chart" width="500" height="80"></canvas>
                    </div>
                </div>
                
                <!-- Results Block -->
                <div style="background: #F4F7FE; padding: 20px; border-radius: 14px; margin-bottom: 25px;">
                    <h2 style="color: #6D63FF; font-size: 16px; margin-bottom: 15px; text-transform: uppercase;">
                        Результаты и исход
                    </h2>
                    <div style="padding: 12px; background: white; border-radius: 8px; font-size: 14px;">
                        <strong>Исход родов:</strong> ${archiveData.outcome}
                    </div>
                </div>
                
                <!-- УДАЛЕН БЛОК С РЕКОМЕНДАЦИЯМИ -->
                
                <!-- Footer -->
                <div style="text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #F0F0F3;">
                    <div style="color: #9A9AAB; font-size: 11px;">
                        Отчет сгенерирован: ${new Date().toLocaleString('ru-RU')}
                    </div>
                    <div style="color: #9A9AAB; font-size: 11px; margin-top: 5px;">
                        Система мониторинга КТГ "Виртуальный раунд"
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(reportContainer);
        
        // Create charts
        await this.createChartsForPDF(archiveData.fwbsAverage, ctgData);
        
        // Wait for charts to render
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Generate PDF using html2canvas and jsPDF
        const canvas = await html2canvas(reportContainer, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });
        
        const imgData = canvas.toDataURL('image/png');
        const pdf = new window.jspdf.jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        // Добавляем изображение на одну страницу (теперь должно помещаться)
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
        
        // Save PDF
        const fileName = `КТГ_отчет_${archiveData.name.replace(/\s+/g, '_')}_${archiveData.date}.pdf`;
        pdf.save(fileName);
        
        // Clean up
        document.body.removeChild(reportContainer);
        
        // Show success notification
        this.showNotification('Отчет успешно сохранен!', 'success');
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        this.showNotification('Ошибка при создании отчета', 'error');
    }
}

// Обновленная функция createChartsForPDF с меньшими размерами
async createChartsForPDF(fwbsScore, ctgData) {
    // Create wellbeing chart (уменьшенный)
    const wellbeingCtx = document.getElementById('wellbeing-chart').getContext('2d');
    new Chart(wellbeingCtx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [fwbsScore, 100 - fwbsScore],
                backgroundColor: [this.getScoreColorHex(fwbsScore), '#F0F0F3'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: true,
            cutout: '75%',
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        },
        plugins: [{
            id: 'centerText',
            afterDraw: function(chart) {
                const ctx = chart.ctx;
                ctx.save();
                const centerX = chart.width / 2;
                const centerY = chart.height / 2;
                ctx.font = 'bold 28px Manrope';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#2C2C3A';
                ctx.fillText(fwbsScore, centerX, centerY);
                ctx.restore();
            }
        }]
    });
    
    // Create FHR chart (уменьшенный)
    const fhrCtx = document.getElementById('fhr-chart').getContext('2d');
    new Chart(fhrCtx, {
        type: 'line',
        data: {
            labels: ctgData.labels,
            datasets: [{
                label: 'ЧСС',
                data: ctgData.fhr,
                borderColor: '#FF1744',
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.15
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: 50,
                    max: 210,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { font: { size: 10 } }
                },
                x: {
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { 
                        font: { size: 9 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 10
                    }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
    
    // Create UA chart (уменьшенный)
    const uaCtx = document.getElementById('ua-chart').getContext('2d');
    new Chart(uaCtx, {
        type: 'line',
        data: {
            labels: ctgData.labels,
            datasets: [{
                label: 'СДМ',
                data: ctgData.ua,
                borderColor: '#0D47A1',
                backgroundColor: 'rgba(13, 71, 161, 0.1)',
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.15,
                fill: true
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { font: { size: 10 } }
                },
                x: {
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { 
                        font: { size: 9 },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 10
                    }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

// Helper function to get hex color based on score
getScoreColorHex(score) {
    if (score >= 85) return '#2ED47A';
    if (score >= 70) return '#FFB946';
    return '#FF5B5B';
}

// Helper function to get score interpretation
getScoreInterpretation(score) {
    if (score >= 85) return 'Нормальное состояние плода. Показатели в пределах нормы.';
    if (score >= 70) return 'Умеренные отклонения. Требуется повышенное внимание.';
    return 'Критическое состояние. Требуется немедленное вмешательство.';
}

// Helper function to get recommendations based on score
getRecommendations(score) {
    if (score >= 85) {
        return `
            <ul style="margin: 0; padding-left: 20px;">
                <li>Продолжить стандартное наблюдение</li>
                <li>Повторный мониторинг КТГ через 4-6 часов</li>
                <li>Контроль жизненных показателей матери</li>
                <li>Документирование данных в медицинской карте</li>
            </ul>
        `;
    } else if (score >= 70) {
        return `
            <ul style="margin: 0; padding-left: 20px;">
                <li>Усиленное наблюдение за состоянием плода</li>
                <li>Повторить КТГ через 1-2 часа</li>
                <li>Консультация акушера-гинеколога</li>
                <li>Рассмотреть дополнительные методы диагностики</li>
                <li>Подготовка к возможному экстренному родоразрешению</li>
            </ul>
        `;
    } else {
        return `
            <ul style="margin: 0; padding-left: 20px; color: #FF5B5B;">
                <li><strong>СРОЧНО!</strong> Немедленная консультация врача</li>
                <li>Подготовка к экстренному родоразрешению</li>
                <li>Непрерывный мониторинг КТГ</li>
                <li>Готовность операционной</li>
                <li>Информирование дежурной бригады</li>
            </ul>
        `;
    }
}

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification--${type}`;
        notification.innerHTML = `
            <span class="notification-text">${message}</span>
        `;
        
        // Add to body
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.classList.add('notification--show');
        }, 10);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('notification--show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }

    startClock() {
        const updateTime = () => {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const timeElement = document.getElementById('current-time');
            if (timeElement) {
                timeElement.textContent = `${hours}:${minutes}`;
            }
        };
        
        updateTime();
        setInterval(updateTime, 1000);
    }
}

// Initialize app when DOM is ready
let archiveApp;

document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing archive page...');
    archiveApp = new ArchiveApp();
    archiveApp.init();
});