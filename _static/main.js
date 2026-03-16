/* =========================================
   Meta Ads Dashboard - App Logic
   ========================================= */

document.addEventListener('DOMContentLoaded', () => {
    // -----------------------------------------
    // 1. Mock Data Generation
    // -----------------------------------------
    
    // Formatter functions
    const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    const formatNumber = (val) => new Intl.NumberFormat('en-US').format(val);
    const formatPercent = (val) => val.toFixed(2) + '%';
    const formatRoas = (val) => val.toFixed(2) + 'x';
    
    // Mock Dashboard Stats per Date Range
    const mockData = {
        today: { spend: 245.50, impressions: 15420, clicks: 342, cpc: 0.72, purchases: 12, cpa: 20.45, roas: 3.2, ctr: 2.21, spendTrend: 5, impressionsTrend: 12, clicksTrend: -2, cpcTrend: -5, purchasesTrend: 8, cpaTrend: -10, roasTrend: 15, ctrTrend: 2 },
        yesterday: { spend: 310.20, impressions: 18500, clicks: 410, cpc: 0.75, purchases: 15, cpa: 20.68, roas: 2.8, ctr: 2.21, spendTrend: 2, impressionsTrend: 5, clicksTrend: 4, cpcTrend: 1, purchasesTrend: 2, cpaTrend: -1, roasTrend: 4, ctrTrend: -1 },
        last7days: { spend: 2150.80, impressions: 145000, clicks: 3254, cpc: 0.66, purchases: 98, cpa: 21.94, roas: 3.5, ctr: 2.24, spendTrend: -12, impressionsTrend: 15, clicksTrend: 18, cpcTrend: -8, purchasesTrend: 25, cpaTrend: -15, roasTrend: 22, ctrTrend: 5 },
        last30days: { spend: 8450.00, impressions: 580000, clicks: 12450, cpc: 0.68, purchases: 385, cpa: 21.94, roas: 3.1, ctr: 2.14, spendTrend: 8, impressionsTrend: 12, clicksTrend: 15, cpcTrend: -2, purchasesTrend: 18, cpaTrend: -5, roasTrend: 10, ctrTrend: 2 },
        thismonth: { spend: 4200.50, impressions: 295000, clicks: 6100, cpc: 0.69, purchases: 190, cpa: 22.10, roas: 2.9, ctr: 2.06, spendTrend: 4, impressionsTrend: 8, clicksTrend: 7, cpcTrend: -1, purchasesTrend: 5, cpaTrend: -2, roasTrend: 6, ctrTrend: 1 }
    };

    // Chart mock data time series based on selection
    const chartDataMap = {
        today: { labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'], spend: [10, 5, 20, 60, 80, 70], roas: [0, 0, 1.5, 4.2, 3.8, 3.5] },
        yesterday: { labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'], spend: [12, 8, 25, 75, 95, 95], roas: [0.5, 0, 2.0, 3.1, 2.8, 2.5] },
        last7days: { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], spend: [250, 310, 280, 410, 350, 200, 350], roas: [2.5, 2.8, 3.1, 3.8, 4.2, 2.0, 3.5] },
        last30days: { labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'], spend: [1800, 2100, 2400, 2150], roas: [2.8, 3.0, 3.4, 3.5] },
        thismonth: { labels: ['Week 1', 'Week 2', 'Week 3'], spend: [2000, 1500, 700], roas: [2.9, 2.8, 3.1] }
    };

    // Campaign list mock
    const campaignsList = [
        { name: "Q3_Retargeting_All_Products", status: "active", spend: 450.20, purchases: 32, cpa: 14.06, roas: 5.2 },
        { name: "Broad_Lookalike_1%_PUR", status: "active", spend: 890.50, purchases: 41, cpa: 21.71, roas: 3.1 },
        { name: "Advantage+_Shopping_US", status: "active", spend: 650.00, purchases: 22, cpa: 29.54, roas: 2.4 },
        { name: "Engagement_Video_Views", status: "paused", spend: 120.00, purchases: 1, cpa: 120.00, roas: 0.5 },
        { name: "LeadGen_Webinar_Signup", status: "active", spend: 40.10, purchases: 2, cpa: 20.05, roas: 1.8 }
    ];

    // -----------------------------------------
    // 2. DOM Elements & Update Logic
    // -----------------------------------------
    
    // Charts instances
    let performanceChartInstance, platformChartInstance;

    const updateMetrics = (range) => {
        const data = mockData[range];
        if(!data) return;

        // Animate counter values
        animateValue("kpi-spend", data.spend, formatCurrency);
        animateValue("kpi-impressions", data.impressions, formatNumber);
        animateValue("kpi-clicks", data.clicks, formatNumber);
        animateValue("kpi-cpc", data.cpc, formatCurrency);
        animateValue("kpi-purchases", data.purchases, formatNumber);
        animateValue("kpi-cpa", data.cpa, formatCurrency);
        animateValue("kpi-roas", data.roas, formatRoas);
        animateValue("kpi-ctr", data.ctr, formatPercent);

        // Update Trends
        updateTrend("trend-spend", data.spendTrend, false); // Spend going up usually bad/neutral, depends on context, assuming neutral
        updateTrend("trend-impressions", data.impressionsTrend, false);
        updateTrend("trend-clicks", data.clicksTrend, false);
        updateTrend("trend-cpc", data.cpcTrend, true); // CPC dropping is positive (inverse)
        updateTrend("trend-purchases", data.purchasesTrend, false);
        updateTrend("trend-cpa", data.cpaTrend, true); // CPA dropping is positive (inverse)
        updateTrend("trend-roas", data.roasTrend, false);
        updateTrend("trend-ctr", data.ctrTrend, false);
        
        // Update Chart
        updateCharts(range);
    };

    const updateTrend = (elementId, value, inverseLogic = false) => {
        const el = document.getElementById(elementId);
        if(!el) return;
        
        const isPositiveValue = value > 0;
        let isGoodMetric;

        // If inverse (like CPA/CPC), falling value is good
        if(inverseLogic) {
            isGoodMetric = value < 0;
        } else {
            isGoodMetric = value > 0;
        }

        const parent = el.parentElement;
        parent.className = "kpi-trend"; // reset
        
        const icon = parent.querySelector('i');
        
        if (value === 0) {
            parent.classList.add("neutral");
            icon.className = "bx bx-minus";
            el.innerText = "0%";
            return;
        }

        if (isGoodMetric) {
            parent.classList.add("positive");
            icon.className = inverseLogic ? "bx bx-trending-down" : "bx bx-trending-up";
        } else {
            parent.classList.add("negative");
            icon.className = inverseLogic ? "bx bx-trending-up" : "bx bx-trending-down";
        }

        el.innerText = Math.abs(value) + "%";
    };

    const animateValue = (id, endVal, formatter) => {
        const obj = document.getElementById(id);
        if(!obj) return;
        
        // Simple fast animation
        const duration = 800;
        const startTimestamp = performance.now();
        const startVal = parseFloat(obj.innerText.replace(/[^0-9.-]+/g,"")) || 0; // rough parse

        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            // easeOutCubic
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const currentVal = startVal + (endVal - startVal) * easeProgress;
            
            obj.innerText = formatter(currentVal);
            
            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                obj.innerText = formatter(endVal); // final ensure formatting
            }
        };
        window.requestAnimationFrame(step);
    };

    const renderTable = () => {
        const tbody = document.getElementById('campaignTableBody');
        tbody.innerHTML = '';
        
        campaignsList.forEach(camp => {
            const tr = document.createElement('tr');
            
            const statusClass = camp.status === 'active' ? 'status-active' : 'status-paused';
            const statusText = camp.status.charAt(0).toUpperCase() + camp.status.slice(1);
            
            tr.innerHTML = `
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td class="campaign-name">${camp.name}</td>
                <td>${formatCurrency(camp.spend)}</td>
                <td>${formatNumber(camp.purchases)}</td>
                <td>${formatCurrency(camp.cpa)}</td>
                <td style="color: ${camp.roas > 3 ? 'var(--accent-emerald)' : 'var(--text-primary)'}">${formatRoas(camp.roas)}</td>
            `;
            tbody.appendChild(tr);
        });
    };

    // -----------------------------------------
    // 3. Chart.js Initialization
    // -----------------------------------------
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";

    const initCharts = () => {
        const ctxPerf = document.getElementById('performanceChart').getContext('2d');
        
        // Gradient for Spend line
        const gradientBlue = ctxPerf.createLinearGradient(0, 0, 0, 400);
        gradientBlue.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
        gradientBlue.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

        performanceChartInstance = new Chart(ctxPerf, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Spend ($)',
                        data: [],
                        borderColor: '#3b82f6',
                        backgroundColor: gradientBlue,
                        borderWidth: 3,
                        pointBackgroundColor: '#0b0f19',
                        pointBorderColor: '#3b82f6',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y'
                    },
                    {
                        label: 'ROAS',
                        data: [],
                        borderColor: '#10b981',
                        backgroundColor: 'transparent',
                        borderWidth: 3,
                        borderDash: [5, 5],
                        pointBackgroundColor: '#0b0f19',
                        pointBorderColor: '#10b981',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        tension: 0.4,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.9)',
                        titleColor: '#f8fafc',
                        bodyColor: '#cbd5e1',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 12,
                        boxPadding: 6,
                        usePointStyle: true,
                    }
                },
                scales: {
                    x: {
                        grid: { display: false, color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { callback: function(value) { return '$' + value; } }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: { display: false },
                        ticks: { callback: function(value) { return value + 'x'; } }
                    }
                }
            }
        });

        // Donut Chart
        const ctxPlat = document.getElementById('platformChart').getContext('2d');
        platformChartInstance = new Chart(ctxPlat, {
            type: 'doughnut',
            data: {
                labels: ['Instagram', 'Facebook', 'Audience Network', 'Messenger'],
                datasets: [{
                    data: [4.2, 2.8, 1.5, 2.1],
                    backgroundColor: [
                        '#ec4899', // Insta
                        '#3b82f6', // Facebook
                        '#8b5cf6', // Audience
                        '#06b6d4'  // Messenger
                    ],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { padding: 20, usePointStyle: true, pointStyle: 'circle' }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ' ' + context.label + ': ' + context.raw + 'x ROAS';
                            }
                        }
                    }
                }
            }
        });
    };

    const updateCharts = (range) => {
        const data = chartDataMap[range];
        if(!data || !performanceChartInstance) return;

        performanceChartInstance.data.labels = data.labels;
        performanceChartInstance.data.datasets[0].data = data.spend; // Spend
        performanceChartInstance.data.datasets[1].data = data.roas;  // ROAS
        performanceChartInstance.update();
    };

    // -----------------------------------------
    // 4. Input Wiring
    // -----------------------------------------
    const dateSelect = document.getElementById('dateRange');
    dateSelect.addEventListener('change', (e) => {
        updateMetrics(e.target.value);
    });

    // Initialize Setup
    initCharts();
    renderTable();
    updateMetrics('last7days'); // Initial load
});
