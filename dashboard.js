// Supabase 설정
const SUPABASE_URL = 'https://nqwjvrznwzmfytjlpfsk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xd2p2cnpud3ptZnl0amxwZnNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzNzA4NTEsImV4cCI6MjA3Mzk0Njg1MX0.R3Y2Xb9PmLr3sCLSdJov4Mgk1eAmhaCIPXEKq6u8NQI';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 전역 변수
let revenueChart = null;
let profitMarginChart = null;
let growthRateChart = null;
let marketShareChart = null;
let currentMonths = 6;
let selectedProducts = ['all']; // 기본값: 전체

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData();
    
    document.getElementById('dateRange').addEventListener('change', (e) => {
        currentMonths = parseInt(e.target.value);
        loadDashboardData();
    });
    
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadDashboardData();
    });
    
    // 상품 필터 이벤트 리스너
    const productFilter = document.getElementById('productFilter');
    productFilter.addEventListener('change', (e) => {
        const selectedOptions = Array.from(e.target.selectedOptions).map(opt => opt.value);
        
        // "전체"가 선택되면 다른 선택 해제
        if (selectedOptions.includes('all')) {
            selectedProducts = ['all'];
            e.target.selectedIndex = 0;
        } else {
            selectedProducts = selectedOptions;
            // "전체" 옵션 선택 해제
            const allOption = e.target.querySelector('option[value="all"]');
            if (allOption) allOption.selected = false;
        }
        
        loadDashboardData();
    });
});

// 대시보드 데이터 로드
async function loadDashboardData() {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - currentMonths);
        
        // 상품별 성과 데이터 가져오기
        const { data: performanceData, error: perfError } = await supabase
            .from('product_performance')
            .select(`
                *,
                products (
                    id,
                    product_name,
                    category,
                    product_code
                )
            `)
            .gte('report_date', startDate.toISOString().split('T')[0])
            .lte('report_date', endDate.toISOString().split('T')[0])
            .order('report_date', { ascending: true });
        
        if (perfError) throw perfError;
        
        // 필터링된 데이터 가져오기
        const filteredData = filterDataByProducts(performanceData);
        
        // 최신 데이터만 가져오기 (상품별)
        const latestData = getLatestDataByProduct(filteredData);
        
        // 통계 업데이트
        updateStatistics(filteredData, latestData);
        
        // 차트 업데이트
        updateCharts(filteredData);
        
        // 테이블 업데이트
        updateTable(latestData);
        
    } catch (error) {
        console.error('데이터 로드 오류:', error);
        alert('데이터를 불러오는 중 오류가 발생했습니다.');
    }
}

// 상품 필터링 함수
function filterDataByProducts(performanceData) {
    if (selectedProducts.includes('all') || selectedProducts.length === 0) {
        return performanceData;
    }
    
    return performanceData.filter(item => {
        const productName = item.products?.product_name || '';
        return selectedProducts.includes(productName);
    });
}

// 상품별 최신 데이터 추출
function getLatestDataByProduct(performanceData) {
    const productMap = new Map();
    
    performanceData.forEach(item => {
        const productId = item.product_id;
        const existing = productMap.get(productId);
        
        if (!existing || new Date(item.report_date) > new Date(existing.report_date)) {
            productMap.set(productId, item);
        }
    });
    
    return Array.from(productMap.values());
}

// 통계 업데이트
function updateStatistics(allData, latestData) {
    // 총 매출
    const totalRevenue = latestData.reduce((sum, item) => sum + parseFloat(item.revenue || 0), 0);
    document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
    
    // 총 이익
    const totalProfit = latestData.reduce((sum, item) => sum + parseFloat(item.profit || 0), 0);
    document.getElementById('totalProfit').textContent = formatCurrency(totalProfit);
    
    // 평균 이익률
    const avgMargin = latestData.length > 0 
        ? latestData.reduce((sum, item) => sum + parseFloat(item.profit_margin || 0), 0) / latestData.length 
        : 0;
    document.getElementById('avgMargin').textContent = avgMargin.toFixed(2) + '%';
    
    // 총 판매량
    const totalSales = latestData.reduce((sum, item) => sum + parseInt(item.sales_quantity || 0), 0);
    document.getElementById('totalSales').textContent = totalSales.toLocaleString() + '개';
    
    // 이전 기간과 비교 (변화율 계산)
    const previousData = getPreviousPeriodData(allData);
    if (previousData.length > 0) {
        const prevRevenue = previousData.reduce((sum, item) => sum + parseFloat(item.revenue || 0), 0);
        const prevProfit = previousData.reduce((sum, item) => sum + parseFloat(item.profit || 0), 0);
        const prevMargin = previousData.length > 0 
            ? previousData.reduce((sum, item) => sum + parseFloat(item.profit_margin || 0), 0) / previousData.length 
            : 0;
        const prevSales = previousData.reduce((sum, item) => sum + parseInt(item.sales_quantity || 0), 0);
        
        updateChangeIndicator('revenueChange', totalRevenue, prevRevenue);
        updateChangeIndicator('profitChange', totalProfit, prevProfit);
        updateChangeIndicator('marginChange', avgMargin, prevMargin, '%');
        updateChangeIndicator('salesChange', totalSales, prevSales);
    }
}

// 이전 기간 데이터 가져오기
function getPreviousPeriodData(allData) {
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() - currentMonths);
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - currentMonths * 2);
    
    return allData.filter(item => {
        const itemDate = new Date(item.report_date);
        return itemDate >= startDate && itemDate < endDate;
    });
}

// 변화율 표시 업데이트
function updateChangeIndicator(elementId, current, previous, suffix = '') {
    const element = document.getElementById(elementId);
    if (previous === 0) {
        element.textContent = '-';
        element.className = 'stat-change';
        return;
    }
    
    const change = ((current - previous) / previous) * 100;
    const isPositive = change >= 0;
    element.textContent = `${isPositive ? '+' : ''}${change.toFixed(1)}% ${suffix}`;
    element.className = `stat-change ${isPositive ? 'positive' : 'negative'}`;
}

// 차트 업데이트
function updateCharts(performanceData) {
    // 데이터 그룹화
    const dataByProduct = groupDataByProduct(performanceData);
    const dates = getUniqueDates(performanceData).sort();
    
    // VOC건수 차트
    updateVOCCountChart(dataByProduct, dates);
    
    // SR 적기 처리율 차트
    updateSRProcessingRateChart(dataByProduct, dates);
    
    // 불만건수 차트
    updateComplaintCountChart(dataByProduct, dates);
    
    // VOC 유형 차트
    updateVOCTypeChart(dataByProduct);
}

// 상품별 데이터 그룹화
function groupDataByProduct(performanceData) {
    const grouped = {};
    
    performanceData.forEach(item => {
        const productName = item.products?.product_name || '알 수 없음';
        if (!grouped[productName]) {
            grouped[productName] = [];
        }
        grouped[productName].push(item);
    });
    
    return grouped;
}

// 고유 날짜 추출
function getUniqueDates(performanceData) {
    const dates = new Set();
    performanceData.forEach(item => dates.add(item.report_date));
    return Array.from(dates);
}

// VOC건수 차트
function updateVOCCountChart(dataByProduct, dates) {
    const ctx = document.getElementById('revenueChart').getContext('2d');
    
    if (revenueChart) {
        revenueChart.destroy();
    }
    
    const datasets = Object.keys(dataByProduct).map((productName, index) => {
        const colors = [
            'rgba(102, 126, 234, 1)',
            'rgba(118, 75, 162, 1)',
            'rgba(237, 100, 166, 1)',
            'rgba(255, 159, 64, 1)',
            'rgba(75, 192, 192, 1)'
        ];
        
        const data = dates.map(date => {
            const item = dataByProduct[productName].find(d => d.report_date === date);
            return item ? parseInt(item.voc_count || 0) : 0;
        });
        
        return {
            label: productName,
            data: data,
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length].replace('1)', '0.1)'),
            tension: 0.4,
            fill: false
        };
    });
    
    revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(d => formatDate(d)),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + context.parsed.y + '건';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value + '건';
                        }
                    }
                }
            }
        }
    });
}

// SR 적기 처리율 차트
function updateSRProcessingRateChart(dataByProduct, dates) {
    const ctx = document.getElementById('profitMarginChart').getContext('2d');
    
    if (profitMarginChart) {
        profitMarginChart.destroy();
    }
    
    const datasets = Object.keys(dataByProduct).map((productName, index) => {
        const colors = [
            'rgba(16, 185, 129, 1)',
            'rgba(59, 130, 246, 1)',
            'rgba(139, 92, 246, 1)',
            'rgba(236, 72, 153, 1)',
            'rgba(251, 146, 60, 1)'
        ];
        
        const data = dates.map(date => {
            const item = dataByProduct[productName].find(d => d.report_date === date);
            return item ? parseFloat(item.sr_processing_rate || 0) : 0;
        });
        
        return {
            label: productName,
            data: data,
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length].replace('1)', '0.1)'),
            tension: 0.4,
            fill: false
        };
    });
    
    profitMarginChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(d => formatDate(d)),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + context.parsed.y.toFixed(2) + '%';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            }
        }
    });
}

// 불만건수 차트
function updateComplaintCountChart(dataByProduct, dates) {
    const ctx = document.getElementById('growthRateChart').getContext('2d');
    
    if (growthRateChart) {
        growthRateChart.destroy();
    }
    
    const datasets = Object.keys(dataByProduct).map((productName, index) => {
        const colors = [
            'rgba(239, 68, 68, 1)',
            'rgba(245, 158, 11, 1)',
            'rgba(34, 197, 94, 1)',
            'rgba(14, 165, 233, 1)',
            'rgba(168, 85, 247, 1)'
        ];
        
        const data = dates.map(date => {
            const item = dataByProduct[productName].find(d => d.report_date === date);
            return item ? parseInt(item.complaint_count || 0) : 0;
        });
        
        return {
            label: productName,
            data: data,
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length].replace('1)', '0.1)'),
            tension: 0.4,
            fill: false
        };
    });
    
    growthRateChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(d => formatDate(d)),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + context.parsed.y + '건';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value + '건';
                        }
                    }
                }
            }
        }
    });
}

// VOC 유형 차트 (10가지 유형 그룹핑)
function updateVOCTypeChart(dataByProduct) {
    const ctx = document.getElementById('marketShareChart').getContext('2d');
    
    if (marketShareChart) {
        marketShareChart.destroy();
    }
    
    // VOC 유형 정의 (10가지)
    const vocTypes = [
        '기능불만',
        '성능이슈',
        '사용성문제',
        '오류발생',
        '응답지연',
        '데이터손실',
        '보안문제',
        '호환성문제',
        '가격불만',
        '기타'
    ];
    
    // 모든 데이터에서 VOC 유형별 카운트 집계
    const vocTypeCounts = {};
    vocTypes.forEach(type => {
        vocTypeCounts[type] = 0;
    });
    
    Object.keys(dataByProduct).forEach(productName => {
        const items = dataByProduct[productName];
        items.forEach(item => {
            const vocType = item.voc_type || '기타';
            if (vocTypeCounts.hasOwnProperty(vocType)) {
                vocTypeCounts[vocType] += parseInt(item.voc_count || 0);
            } else {
                vocTypeCounts['기타'] += parseInt(item.voc_count || 0);
            }
        });
    });
    
    const labels = Object.keys(vocTypeCounts);
    const data = labels.map(type => vocTypeCounts[type]);
    
    const colors = [
        'rgba(102, 126, 234, 0.8)',
        'rgba(118, 75, 162, 0.8)',
        'rgba(237, 100, 166, 0.8)',
        'rgba(255, 159, 64, 0.8)',
        'rgba(75, 192, 192, 0.8)',
        'rgba(239, 68, 68, 0.8)',
        'rgba(245, 158, 11, 0.8)',
        'rgba(34, 197, 94, 0.8)',
        'rgba(14, 165, 233, 0.8)',
        'rgba(168, 85, 247, 0.8)'
    ];
    
    marketShareChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                            return context.label + ': ' + context.parsed + '건 (' + percentage + '%)';
                        }
                    }
                }
            }
        }
    });
}

// 테이블 업데이트
function updateTable(latestData) {
    const tbody = document.getElementById('productTableBody');
    tbody.innerHTML = '';
    
    if (latestData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading">데이터가 없습니다.</td></tr>';
        return;
    }
    
    // 매출 기준 정렬
    latestData.sort((a, b) => parseFloat(b.revenue || 0) - parseFloat(a.revenue || 0));
    
    latestData.forEach(item => {
        const product = item.products || {};
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td><strong>${product.product_name || '알 수 없음'}</strong></td>
            <td>${product.category || '-'}</td>
            <td>${formatCurrency(parseFloat(item.revenue || 0))}</td>
            <td class="${parseFloat(item.profit || 0) >= 0 ? 'positive-value' : 'negative-value'}">
                ${formatCurrency(parseFloat(item.profit || 0))}
            </td>
            <td class="${parseFloat(item.profit_margin || 0) >= 0 ? 'positive-value' : 'negative-value'}">
                ${parseFloat(item.profit_margin || 0).toFixed(2)}%
            </td>
            <td>${parseInt(item.sales_quantity || 0).toLocaleString()}개</td>
            <td class="${parseFloat(item.growth_rate || 0) >= 0 ? 'positive-value' : 'negative-value'}">
                ${parseFloat(item.growth_rate || 0).toFixed(2)}%
            </td>
            <td>${parseFloat(item.market_share || 0).toFixed(2)}%</td>
            <td>${parseFloat(item.customer_satisfaction || 0).toFixed(1)}/5.0</td>
        `;
        
        tbody.appendChild(row);
    });
}

// 유틸리티 함수들
function formatCurrency(value) {
    return new Intl.NumberFormat('ko-KR', {
        style: 'currency',
        currency: 'KRW',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return `${date.getMonth() + 1}/${date.getDate()}`;
}
