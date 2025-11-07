const express = require("express");
const router = express.Router();
const puppeteer = require('puppeteer');
const { verifyToken } = require("../../middleware/auth");
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

router.get("/pdf", verifyToken, async (req, res) => {
  try {
    const { month, year } = req.query;
    const userRole = req.user.role_id;

    if (userRole !== 'R03') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Super admin only.' 
      });
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);
    
    if (!monthNum || !yearNum || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid month or year' 
      });
    }

    console.log(`📄 Generating PDF report for ${monthNum}/${yearNum}`);

    const reportData = await fetchReportData(monthNum, yearNum);

    if (!reportData) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch report data'
      });
    }

    const charts = await generateCharts(reportData);

    const htmlContent = generateHTMLTemplate(reportData, charts);

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm'
      }
    });

    await browser.close();

    const filename = `MSEUF_Monthly_Report_${reportData.period.month_name}_${reportData.period.year}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    console.log(`✅ PDF generated successfully: ${filename}`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('❌ Error generating PDF report:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error', 
      error: error.message 
    });
  }
});


async function fetchReportData(month, year) {
  const connection = require("../../controllers/database");
  
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  try {
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_reservations,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM reservations
      WHERE created_at >= ? AND created_at <= ?
    `;

    const summary = await queryPromise(summaryQuery, [startDate, endDate]);

    const totalProcessed = (summary[0].approved || 0) + (summary[0].rejected || 0);
    const approvalRate = totalProcessed > 0 
      ? ((summary[0].approved / totalProcessed) * 100).toFixed(1) 
      : 0;

    const avgApprovalTimeQuery = `
      SELECT 
        AVG(TIMESTAMPDIFF(HOUR, r.created_at, ra.acted_at)) as avg_hours
      FROM reservations r
      JOIN reservation_approvals ra ON r.id = ra.reservation_id
      WHERE r.created_at >= ? AND r.created_at <= ?
        AND ra.status = 'approved'
        AND ra.acted_at IS NOT NULL
    `;

    const avgTimeResult = await queryPromise(avgApprovalTimeQuery, [startDate, endDate]);
    const avgApprovalHours = avgTimeResult[0]?.avg_hours || 0;
    const avgApprovalHoursFormatted = parseFloat(avgApprovalHours).toFixed(1);

    const resourceUtilizationQuery = `
      SELECT 
        ur.f_name as resource_name,
        ur.category,
        COALESCE(COUNT(r.id), 0) as booking_count,
        COALESCE(SUM(CASE WHEN r.status = 'approved' THEN 1 ELSE 0 END), 0) as approved_bookings
      FROM university_resources ur
      LEFT JOIN reservations r ON ur.f_id = r.f_id 
        AND r.created_at >= ? AND r.created_at <= ?
      GROUP BY ur.f_id, ur.f_name, ur.category
      ORDER BY booking_count DESC, ur.f_name ASC
    `;

    const resourceUtilization = await queryPromise(resourceUtilizationQuery, [startDate, endDate]);

    const categoryBreakdownQuery = `
      SELECT 
        ur.category,
        COUNT(r.id) as booking_count
      FROM reservations r
      JOIN university_resources ur ON r.f_id = ur.f_id
      WHERE r.created_at >= ? AND r.created_at <= ?
      GROUP BY ur.category
      ORDER BY booking_count DESC
    `;

    const categoryBreakdown = await queryPromise(categoryBreakdownQuery, [startDate, endDate]);

    const dailyTrendsQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM reservations
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    const dailyTrends = await queryPromise(dailyTrendsQuery, [startDate, endDate]);

    const allUsersQuery = `
      SELECT 
        u.name,
        u.department,
        COALESCE(COUNT(r.id), 0) as total_requests,
        COALESCE(SUM(CASE WHEN r.status = 'approved' THEN 1 ELSE 0 END), 0) as approved,
        COALESCE(SUM(CASE WHEN r.status = 'rejected' THEN 1 ELSE 0 END), 0) as rejected,
        COALESCE(AVG(CASE 
          WHEN ra.status = 'approved' AND ra.acted_at IS NOT NULL 
          THEN TIMESTAMPDIFF(HOUR, r.created_at, ra.acted_at) 
          ELSE NULL 
        END), 0) as avg_approval_hours
      FROM users u
      LEFT JOIN reservations r ON u.id = r.requester_id
        AND r.created_at >= ? AND r.created_at <= ?
      LEFT JOIN reservation_approvals ra ON r.id = ra.reservation_id
        AND ra.status = 'approved'
        AND ra.acted_at IS NOT NULL
      WHERE u.role_id = 'R01'
      GROUP BY u.id, u.name, u.department
      ORDER BY total_requests DESC, u.name ASC
    `;

    const topRequesters = await queryPromise(allUsersQuery, [startDate, endDate]);

    const allDepartmentsQuery = `
      SELECT DISTINCT
        u.department,
        COALESCE(booking_data.booking_count, 0) as booking_count
      FROM users u
      LEFT JOIN (
        SELECT 
          u2.department,
          COUNT(r.id) as booking_count
        FROM reservations r
        JOIN users u2 ON r.requester_id = u2.id
        WHERE r.created_at >= ? AND r.created_at <= ?
          AND u2.role_id = 'R01'
        GROUP BY u2.department
      ) booking_data ON u.department = booking_data.department
      WHERE u.role_id = 'R01' 
        AND u.department IS NOT NULL 
        AND u.department != ''
      ORDER BY booking_count DESC, u.department ASC
    `;

    const departmentBreakdown = await queryPromise(allDepartmentsQuery, [startDate, endDate]);

    const adminPerformanceQuery = `
      SELECT 
        u.id,
        u.name,
        u.department,
        u.role_id,
        COUNT(ra.id) as total_actions,
        SUM(CASE WHEN ra.status = 'approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN ra.status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
        AVG(CASE 
          WHEN ra.status = 'approved' AND ra.acted_at IS NOT NULL AND r.created_at IS NOT NULL
          THEN TIMESTAMPDIFF(HOUR, r.created_at, ra.acted_at)
          ELSE NULL
        END) as avg_processing_hours
      FROM users u
      LEFT JOIN reservation_approvals ra ON u.id = ra.approver_id
        AND ra.acted_at >= ? AND ra.acted_at <= ?
      LEFT JOIN reservations r ON ra.reservation_id = r.id
      WHERE u.role_id IN ('R02', 'R03')
        AND ra.id IS NOT NULL
      GROUP BY u.id, u.name, u.department, u.role_id
      HAVING total_actions > 0
      ORDER BY total_actions DESC, u.name ASC
    `;

    const adminPerformance = await queryPromise(adminPerformanceQuery, [startDate, endDate]);

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];

    console.log(`✅ Fetched report data:`);
    console.log(`   Total resources (including unused): ${resourceUtilization.length}`);
    console.log(`   Total R01 users (including inactive): ${topRequesters.length}`);
    console.log(`   Total departments from R01 users: ${departmentBreakdown.length}`);
    console.log(`   Active admins/superadmins: ${adminPerformance.length}`);

    return {
      period: {
        month: month,
        year: year,
        month_name: monthNames[month - 1],
        display: `${monthNames[month - 1]} ${year}`,
      },
      summary: {
        total_reservations: summary[0].total_reservations || 0,
        approved: summary[0].approved || 0,
        rejected: summary[0].rejected || 0,
        pending: summary[0].pending || 0,
        cancelled: summary[0].cancelled || 0,
        approval_rate_percentage: parseFloat(approvalRate),
        avg_approval_time_hours: parseFloat(avgApprovalHoursFormatted),
      },
      resource_utilization: resourceUtilization,
      category_breakdown: categoryBreakdown,
      daily_trends: dailyTrends,
      top_requesters: topRequesters,
      department_breakdown: departmentBreakdown,
      admin_performance: adminPerformance,
      generated_at: new Date().toISOString(),
    };

  } catch (error) {
    console.error('Error fetching report data:', error);
    return null;
  }
}

async function generateCharts(reportData) {
  const width = 800;
  const height = 400;
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });

  const charts = {};

  try {
    const statusLabels = ['Approved', 'Rejected', 'Pending', 'Cancelled'];
    const statusData = [
      reportData.summary.approved,
      reportData.summary.rejected,
      reportData.summary.pending,
      reportData.summary.cancelled
    ];

    const statusConfig = {
      type: 'pie',
      data: {
        labels: statusLabels,
        datasets: [{
          data: statusData,
          backgroundColor: ['#2E7D32', '#C62828', '#F57C00', '#616161'],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'right',
            labels: { font: { size: 14 }, padding: 15 }
          },
          title: {
            display: true,
            text: 'Reservation Status Distribution',
            font: { size: 18, weight: 'bold' },
            padding: { top: 10, bottom: 30 }
          }
        }
      }
    };

    charts.statusPie = await chartJSNodeCanvas.renderToDataURL(statusConfig);

    const resourcesWithBookings = reportData.resource_utilization.filter(r => r.booking_count > 0);
    const topResources = resourcesWithBookings.slice(0, 15);
    const resourceLabels = topResources.map(r => r.resource_name);
    const resourceBookings = topResources.map(r => r.booking_count);

    const resourceConfig = {
      type: 'bar',
      data: {
        labels: resourceLabels,
        datasets: [{
          label: 'Number of Bookings',
          data: resourceBookings,
          backgroundColor: '#8B0000',
          borderColor: '#6B0000',
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: `Most Booked Resources (${resourcesWithBookings.length} booked / ${reportData.resource_utilization.length} total)`,
            font: { size: 18, weight: 'bold' },
            padding: { top: 10, bottom: 30 }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { font: { size: 12 } }
          },
          y: {
            ticks: { font: { size: 10 } }
          }
        }
      }
    };

    charts.resourceBar = await chartJSNodeCanvas.renderToDataURL(resourceConfig);

    const trendLabels = reportData.daily_trends.map(d => {
      const date = new Date(d.date);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    });
    const trendTotals = reportData.daily_trends.map(d => d.total);
    const trendApproved = reportData.daily_trends.map(d => d.approved);
    const trendRejected = reportData.daily_trends.map(d => d.rejected);

    const trendConfig = {
      type: 'line',
      data: {
        labels: trendLabels,
        datasets: [
          {
            label: 'Total Reservations',
            data: trendTotals,
            borderColor: '#1976D2',
            backgroundColor: 'rgba(25, 118, 210, 0.1)',
            tension: 0.4,
            fill: true
          },
          {
            label: 'Approved',
            data: trendApproved,
            borderColor: '#2E7D32',
            backgroundColor: 'rgba(46, 125, 50, 0.1)',
            tension: 0.4,
            fill: true
          },
          {
            label: 'Rejected',
            data: trendRejected,
            borderColor: '#C62828',
            backgroundColor: 'rgba(198, 40, 40, 0.1)',
            tension: 0.4,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'top',
            labels: { font: { size: 12 }, padding: 15 }
          },
          title: {
            display: true,
            text: 'Daily Reservation Trends',
            font: { size: 18, weight: 'bold' },
            padding: { top: 10, bottom: 30 }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { font: { size: 12 } }
          },
          x: {
            ticks: { font: { size: 11 } }
          }
        }
      }
    };

    charts.trendLine = await chartJSNodeCanvas.renderToDataURL(trendConfig);

    const categoryLabels = reportData.category_breakdown.map(c => c.category);
    const categoryData = reportData.category_breakdown.map(c => c.booking_count);

    const categoryConfig = {
      type: 'doughnut',
      data: {
        labels: categoryLabels,
        datasets: [{
          data: categoryData,
          backgroundColor: ['#8B0000', '#0F766E', '#EA580C', '#2563EB', '#7C3AED', '#DB2777'],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'right',
            labels: { font: { size: 14 }, padding: 15 }
          },
          title: {
            display: true,
            text: 'Bookings by Resource Category',
            font: { size: 18, weight: 'bold' },
            padding: { top: 10, bottom: 30 }
          }
        }
      }
    };

    charts.categoryDoughnut = await chartJSNodeCanvas.renderToDataURL(categoryConfig);

    console.log('✅ All charts generated successfully');
    return charts;

  } catch (error) {
    console.error('❌ Error generating charts:', error);
    return {};
  }
}

function generateHTMLTemplate(data, charts) {
  const generatedDate = new Date(data.generated_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const insights = generateInsights(data);
  
  const activeRequesters = data.top_requesters.filter(u => u.total_requests > 0);
  const activeResources = data.resource_utilization.filter(r => r.booking_count > 0);
  const activeDepartments = data.department_breakdown.filter(d => d.booking_count > 0);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MSEUF Monthly Report - ${data.period.display}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #1a1a1a;
      line-height: 1.5;
      font-size: 10pt;
    }

    @page {
      margin: 15mm;
      size: A4;
    }

    /* HEADER */
    .document-header {
      border-bottom: 3pt solid #8B0000;
      padding-bottom: 12pt;
      margin-bottom: 20pt;
    }

    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 10pt;
    }

    .university-info h1 {
      font-size: 14pt;
      font-weight: 700;
      color: #8B0000;
      margin-bottom: 2pt;
    }

    .university-info p {
      font-size: 9pt;
      color: #666;
    }

    .document-meta {
      text-align: right;
      font-size: 8pt;
      color: #666;
    }

    .document-meta strong {
      color: #1a1a1a;
      display: block;
      font-size: 9pt;
    }

    .report-title-block {
      margin-top: 12pt;
    }

    .report-title-block h2 {
      font-size: 18pt;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 4pt;
    }

    .report-subtitle {
      font-size: 10pt;
      color: #666;
    }

    /* KPI CARDS */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10pt;
      margin: 20pt 0;
    }

    .kpi-card {
      border: 1pt solid #ddd;
      padding: 12pt;
      background: #fafafa;
    }

    .kpi-label {
      font-size: 8pt;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5pt;
      margin-bottom: 6pt;
      font-weight: 600;
    }

    .kpi-value {
      font-size: 24pt;
      font-weight: 700;
      color: #8B0000;
      line-height: 1;
      margin-bottom: 4pt;
    }

    .kpi-context {
      font-size: 8pt;
      color: #888;
    }

    /* SECTIONS */
    .section {
      margin-bottom: 24pt;
      page-break-inside: avoid;
    }

    .section-header {
      border-left: 4pt solid #8B0000;
      padding-left: 10pt;
      margin-bottom: 12pt;
      page-break-after: avoid;
    }

    .section-title {
      font-size: 12pt;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 2pt;
    }

    .section-subtitle {
      font-size: 9pt;
      color: #666;
    }

    /* INSIGHTS BOX */
    .insights-box {
      background: #f5f5f5;
      border-left: 4pt solid #8B0000;
      padding: 14pt;
      margin: 16pt 0;
      page-break-inside: avoid;
    }

    .insights-box h3 {
      font-size: 10pt;
      font-weight: 700;
      margin-bottom: 8pt;
      color: #1a1a1a;
    }

    .insights-box ul {
      margin-left: 16pt;
    }

    .insights-box li {
      margin-bottom: 6pt;
      font-size: 9pt;
      line-height: 1.5;
    }

    /* TWO-COLUMN LAYOUT */
    .two-column {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16pt;
      margin: 16pt 0;
      page-break-inside: avoid;
    }

    .column {
      min-width: 0;
    }

    /* CHARTS */
    .chart-wrapper {
      margin: 16pt 0;
      page-break-inside: avoid;
    }

    .chart-container {
      border: 1pt solid #ddd;
      padding: 12pt;
      background: white;
      text-align: center;
    }

    .chart-container img {
      max-width: 100%;
      height: auto;
    }

    .chart-caption {
      margin-top: 8pt;
      font-size: 8pt;
      color: #666;
      font-style: italic;
    }

    /* TABLES */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12pt 0;
      font-size: 9pt;
      page-break-inside: auto;
    }

    thead {
      background: #2c3e50;
      color: white;
      display: table-header-group;
    }

    th {
      padding: 8pt 6pt;
      text-align: left;
      font-weight: 600;
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.3pt;
    }

    td {
      padding: 6pt;
      border-bottom: 1pt solid #eee;
    }

    tbody tr {
      page-break-inside: avoid;
    }

    tbody tr:nth-child(even) {
      background: #fafafa;
    }

    .rank-cell {
      text-align: center;
      font-weight: 700;
      color: #8B0000;
    }

    .top-performer {
      background: #fff9e6 !important;
    }

    .numeric {
      text-align: right;
      font-weight: 600;
    }

    .inactive-row {
      opacity: 0.5;
      font-style: italic;
    }

    /* STAT GRID */
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8pt;
      margin: 12pt 0;
    }

    .stat-item {
      display: flex;
      justify-content: space-between;
      padding: 8pt;
      background: #fafafa;
      border-left: 3pt solid #ddd;
      font-size: 9pt;
    }

    .stat-item strong {
      color: #8B0000;
      font-size: 10pt;
    }

    /* DATA SUMMARY BOX */
    .data-summary {
      background: #f0f7ff;
      border: 1pt solid #b3d9ff;
      border-left: 4pt solid #0066cc;
      padding: 10pt;
      margin: 12pt 0;
      font-size: 8pt;
      page-break-inside: avoid;
    }

    .data-summary strong {
      color: #0066cc;
    }

    /* PAGE BREAKS */
    .page-break {
      page-break-after: always;
    }

    .page-break-before {
      page-break-before: always;
    }

    /* FOOTER */
    .document-footer {
      margin-top: 30pt;
      padding-top: 12pt;
      border-top: 2pt solid #ddd;
      font-size: 8pt;
      color: #666;
      display: flex;
      justify-content: space-between;
      page-break-inside: avoid;
    }

    .footer-section {
      flex: 1;
    }

    /* ROLE BADGE */
    .role-badge {
      display: inline-block;
      padding: 2pt 6pt;
      border-radius: 4pt;
      font-size: 7pt;
      font-weight: 600;
      margin-left: 4pt;
    }

    .role-admin {
      background: #e3f2fd;
      color: #1565c0;
    }

    .role-superadmin {
      background: #fce4ec;
      color: #c2185b;
    }

    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <!-- PAGE 1: EXECUTIVE SUMMARY -->
  
  <div class="document-header">
    <div class="header-top">
      <div class="university-info">
        <h1>Manuel S. Enverga University Foundation</h1>
        <p>Candelaria, Inc. | Academic Resource Management</p>
      </div>
      <div class="document-meta">
        <strong>Document ID: RPT-${data.period.year}${String(data.period.month).padStart(2, '0')}</strong>
        Classification: Internal Use<br>
        Generated: ${generatedDate}<br>
        Version: 2.1
      </div>
    </div>
    
    <div class="report-title-block">
      <h2>Monthly Reservation Report</h2>
      <p class="report-subtitle">${data.period.display} | Comprehensive Analysis & Performance Metrics</p>
    </div>
  </div>

  <!-- Key Performance Indicators -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Total Reservations</div>
      <div class="kpi-value">${data.summary.total_reservations}</div>
      <div class="kpi-context">Requests processed</div>
    </div>
    
    <div class="kpi-card">
      <div class="kpi-label">Approval Rate</div>
      <div class="kpi-value">${data.summary.approval_rate_percentage}%</div>
      <div class="kpi-context">${data.summary.approved} approved</div>
    </div>
    
    <div class="kpi-card">
      <div class="kpi-label">Avg. Processing</div>
      <div class="kpi-value">${data.summary.avg_approval_time_hours}</div>
      <div class="kpi-context">Hours to approve</div>
    </div>
    
    <div class="kpi-card">
      <div class="kpi-label">Active Users</div>
      <div class="kpi-value">${activeRequesters.length}</div>
      <div class="kpi-context">of ${data.top_requesters.length} total (R01)</div>
    </div>
  </div>

  <!-- Executive Insights -->
  <div class="insights-box">
    <h3>📊 Key Findings & Recommendations</h3>
    <ul>
      ${insights.map(insight => `<li>${insight}</li>`).join('')}
    </ul>
  </div>

  <!-- Status Breakdown -->
  <div class="section">
    <div class="section-header">
      <div class="section-title">Reservation Status Overview</div>
      <div class="section-subtitle">Breakdown of all ${data.summary.total_reservations} requests received in ${data.period.display}</div>
    </div>
    
    <div class="stat-grid">
      <div class="stat-item" style="border-color: #2E7D32;">
        <span>✓ Approved</span>
        <strong>${data.summary.approved}</strong>
      </div>
      <div class="stat-item" style="border-color: #C62828;">
        <span>✗ Rejected</span>
        <strong>${data.summary.rejected}</strong>
      </div>
      <div class="stat-item" style="border-color: #F57C00;">
        <span>⏳ Pending</span>
        <strong>${data.summary.pending}</strong>
      </div>
      <div class="stat-item" style="border-color: #616161;">
        <span>⊘ Cancelled</span>
        <strong>${data.summary.cancelled}</strong>
      </div>
    </div>
  </div>

  <!-- PAGE 2: VISUAL ANALYSIS -->
  <div class="page-break"></div>

  <div class="section">
    <div class="section-header">
      <div class="section-title">Visual Analysis Overview</div>
      <div class="section-subtitle">Graphical representation of key metrics and trends</div>
    </div>

    <div class="two-column">
      <div class="column">
        <div class="chart-container">
          <img src="${charts.statusPie}" alt="Status Distribution" style="max-height: 260pt;" />
          <p class="chart-caption">Figure 1: Overall Status Distribution</p>
        </div>
      </div>
      
      <div class="column">
        <div class="chart-container">
          <img src="${charts.categoryDoughnut}" alt="Category Breakdown" style="max-height: 260pt;" />
          <p class="chart-caption">Figure 2: Bookings by Resource Category</p>
        </div>
      </div>
    </div>

    <div class="chart-wrapper">
      <div class="chart-container">
        <img src="${charts.trendLine}" alt="Daily Trends" style="max-height: 280pt;" />
        <p class="chart-caption">Figure 3: Daily Reservation Activity Throughout ${data.period.display}</p>
      </div>
    </div>
  </div>

  <!-- PAGE 3: DEPARTMENT ANALYSIS -->
  <div class="page-break"></div>

  <div class="section">
    <div class="section-header">
      <div class="section-title">Complete Department Activity Analysis</div>
      <div class="section-subtitle">All departments with R01 users | ${activeDepartments.length} active, ${data.department_breakdown.length - activeDepartments.length} inactive</div>
    </div>

    <div class="data-summary">
      <strong>📋 Data Coverage:</strong> Showing all ${data.department_breakdown.length} departments. 
      Active departments (${activeDepartments.length}) are highlighted; 
      inactive departments (${data.department_breakdown.length - activeDepartments.length}) shown in gray for complete transparency.
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 10%;">Rank</th>
          <th>Department Name</th>
          <th style="width: 18%; text-align: right;">Total Bookings</th>
          <th style="width: 15%; text-align: right;">Share %</th>
        </tr>
      </thead>
      <tbody>
        ${data.department_breakdown.map((dept, index) => {
          const percentage = data.summary.total_reservations > 0
            ? ((dept.booking_count / data.summary.total_reservations) * 100).toFixed(1)
            : 0;
          const activeIndex = activeDepartments.indexOf(dept);
          const isActive = activeIndex !== -1;
          const rank = isActive ? activeIndex + 1 : '-';
          const isTopThree = isActive && activeIndex < 3;
          
          return `
          <tr ${isTopThree ? 'class="top-performer"' : ''} ${!isActive ? 'class="inactive-row"' : ''}>
            <td class="rank-cell">${rank}</td>
            <td>${dept.department}</td>
            <td class="numeric">${dept.booking_count || '0'}</td>
            <td class="numeric">${isActive ? percentage + '%' : 'No activity'}</td>
          </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  </div>

  <!-- RESOURCE UTILIZATION ANALYSIS -->
  <div class="page-break-before"></div>

  <div class="section">
    <div class="section-header">
      <div class="section-title">Complete Resource Utilization Analysis</div>
      <div class="section-subtitle">All ${data.resource_utilization.length} university resources | ${activeResources.length} booked, ${data.resource_utilization.length - activeResources.length} unused this period</div>
    </div>

    <div class="chart-wrapper">
      <div class="chart-container">
        <img src="${charts.resourceBar}" alt="Top Resources" style="max-height: 300pt;" />
        <p class="chart-caption">Figure 4: Most Utilized Resources (Complete list in table below)</p>
      </div>
    </div>

    <div class="data-summary">
      <strong>📋 Data Coverage:</strong> Showing all ${data.resource_utilization.length} resources in the system. 
      Resources with bookings (${activeResources.length}) are highlighted; 
      unused resources (${data.resource_utilization.length - activeResources.length}) shown in gray to track underutilization.
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 10%;">Rank</th>
          <th>Resource Name</th>
          <th style="width: 22%;">Category</th>
          <th style="width: 12%; text-align: right;">Bookings</th>
          <th style="width: 12%; text-align: right;">Approved</th>
          <th style="width: 14%; text-align: right;">Success %</th>
        </tr>
      </thead>
      <tbody>
        ${data.resource_utilization.map((resource, index) => {
          const activeIndex = activeResources.indexOf(resource);
          const isActive = activeIndex !== -1;
          const rank = isActive ? activeIndex + 1 : '-';
          const isTopFive = isActive && activeIndex < 5;
          const successRate = resource.booking_count > 0 
            ? ((resource.approved_bookings / resource.booking_count) * 100).toFixed(1) 
            : 0;
          
          return `
          <tr ${isTopFive ? 'class="top-performer"' : ''} ${!isActive ? 'class="inactive-row"' : ''}>
            <td class="rank-cell">${rank}</td>
            <td>${resource.resource_name}</td>
            <td>${resource.category}</td>
            <td class="numeric">${resource.booking_count || '0'}</td>
            <td class="numeric">${resource.approved_bookings || '0'}</td>
            <td class="numeric">${isActive ? successRate + '%' : 'No activity'}</td>
          </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  </div>

  <!-- USER ACTIVITY ANALYSIS (R01) -->
  <div class="page-break-before"></div>

  <div class="section">
    <div class="section-header">
      <div class="section-title">Complete User Activity Analysis (Role R01)</div>
      <div class="section-subtitle">All ${data.top_requesters.length} R01 users | ${activeRequesters.length} active, ${data.top_requesters.length - activeRequesters.length} inactive this period</div>
    </div>

    <div class="data-summary">
      <strong>📋 Data Coverage:</strong> Showing all ${data.top_requesters.length} users with Role R01 in the system. 
      Active users (${activeRequesters.length}) who made requests are highlighted; 
      inactive users (${data.top_requesters.length - activeRequesters.length}) shown in gray for complete roster visibility.
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 7%;">Rank</th>
          <th>Name</th>
          <th style="width: 17%;">Department</th>
          <th style="width: 9%; text-align: right;">Total</th>
          <th style="width: 9%; text-align: right;">Approved</th>
          <th style="width: 9%; text-align: right;">Rejected</th>
          <th style="width: 11%; text-align: right;">Success %</th>
          <th style="width: 13%; text-align: right;">Avg. Hours</th>
        </tr>
      </thead>
      <tbody>
        ${data.top_requesters.map((user, index) => {
          const activeIndex = activeRequesters.indexOf(user);
          const isActive = activeIndex !== -1;
          const rank = isActive ? activeIndex + 1 : '-';
          const isTopThree = isActive && activeIndex < 3;
          const successRate = user.total_requests > 0 
            ? ((user.approved / user.total_requests) * 100).toFixed(1) 
            : 0;
          const avgHours = user.avg_approval_hours > 0 ? parseFloat(user.avg_approval_hours).toFixed(1) : '-';
          
          return `
          <tr ${isTopThree ? 'class="top-performer"' : ''} ${!isActive ? 'class="inactive-row"' : ''}>
            <td class="rank-cell">${rank}</td>
            <td>${user.name}</td>
            <td>${user.department || 'N/A'}</td>
            <td class="numeric">${user.total_requests || '0'}</td>
            <td class="numeric">${user.approved || '0'}</td>
            <td class="numeric">${user.rejected || '0'}</td>
            <td class="numeric">${isActive ? successRate + '%' : 'No activity'}</td>
            <td class="numeric">${avgHours}</td>
          </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  </div>

  <!-- NEW: ADMIN PERFORMANCE ANALYSIS -->
  ${data.admin_performance && data.admin_performance.length > 0 ? `
  <div class="page-break-before"></div>

  <div class="section">
    <div class="section-header">
      <div class="section-title">Admin & Super Admin Performance Analysis</div>
      <div class="section-subtitle">Approval workflow performance metrics | ${data.admin_performance.length} active approvers this period</div>
    </div>

    <div class="data-summary">
      <strong>⚡ Performance Metrics:</strong> This section tracks the efficiency of admins (R02) and super admins (R03) 
      who processed reservations during ${data.period.display}. Only users with approval activity are shown.
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 7%;">Rank</th>
          <th>Name</th>
          <th style="width: 15%;">Department</th>
          <th style="width: 8%;">Role</th>
          <th style="width: 10%; text-align: right;">Actions</th>
          <th style="width: 10%; text-align: right;">Approved</th>
          <th style="width: 10%; text-align: right;">Rejected</th>
          <th style="width: 12%; text-align: right;">Approval %</th>
          <th style="width: 13%; text-align: right;">Avg. Hours</th>
        </tr>
      </thead>
      <tbody>
        ${data.admin_performance.map((admin, index) => {
          const totalActions = admin.total_actions || 0;
          const approvedCount = admin.approved_count || 0;
          const rejectedCount = admin.rejected_count || 0;
          const approvalRate = totalActions > 0 
            ? ((approvedCount / totalActions) * 100).toFixed(1) 
            : 0;
          const avgHours = admin.avg_processing_hours > 0 
            ? parseFloat(admin.avg_processing_hours).toFixed(1) 
            : '-';
          const isTopThree = index < 3;
          const roleLabel = admin.role_id === 'R03' ? 'Super Admin' : 'Admin';
          const roleClass = admin.role_id === 'R03' ? 'role-superadmin' : 'role-admin';
          
          return `
          <tr ${isTopThree ? 'class="top-performer"' : ''}>
            <td class="rank-cell">${index + 1}</td>
            <td>${admin.name}<span class="role-badge ${roleClass}">${roleLabel}</span></td>
            <td>${admin.department || 'N/A'}</td>
            <td>${admin.role_id}</td>
            <td class="numeric">${totalActions}</td>
            <td class="numeric" style="color: #2E7D32;">${approvedCount}</td>
            <td class="numeric" style="color: #C62828;">${rejectedCount}</td>
            <td class="numeric">${approvalRate}%</td>
            <td class="numeric">${avgHours}</td>
          </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <div class="insights-box" style="margin-top: 16pt;">
      <h3>📈 Admin Performance Insights</h3>
      <ul>
        <li><strong>Most Active:</strong> ${data.admin_performance[0]?.name} processed ${data.admin_performance[0]?.total_actions} reservations</li>
        <li><strong>Average Processing Time:</strong> ${(data.admin_performance.reduce((sum, a) => sum + (a.avg_processing_hours || 0), 0) / data.admin_performance.length).toFixed(1)} hours across all admins</li>
        <li><strong>Overall Admin Approval Rate:</strong> ${((data.admin_performance.reduce((sum, a) => sum + (a.approved_count || 0), 0) / data.admin_performance.reduce((sum, a) => sum + (a.total_actions || 0), 0)) * 100).toFixed(1)}%</li>
      </ul>
    </div>
  </div>
  ` : ''}

  <!-- Footer -->
  <div class="document-footer">
    <div class="footer-section">
      <strong>Manuel S. Enverga University Foundation</strong><br>
      Candelaria, Inc.<br>
      Academic Resource Management System v2.1
    </div>
    <div class="footer-section" style="text-align: center;">
      <strong>Report Period:</strong> ${data.period.display}<br>
      <strong>Generated:</strong> ${generatedDate}<br>
      <strong>Complete Dataset</strong>
    </div>
    <div class="footer-section" style="text-align: right;">
      <strong>Data Summary:</strong><br>
      ${data.top_requesters.length} Users | ${data.resource_utilization.length} Resources | ${data.admin_performance?.length || 0} Admins<br>
      Contact: resources@mseuf.edu.ph
    </div>
  </div>
</body>
</html>
  `;
}

function generateInsights(data) {
  const insights = [];
  
  if (data.summary.approval_rate_percentage >= 80) {
    insights.push(`<strong>High approval rate (${data.summary.approval_rate_percentage}%):</strong> System demonstrates efficient request processing. Maintain current approval workflows.`);
  } else if (data.summary.approval_rate_percentage < 60) {
    insights.push(`<strong>Low approval rate (${data.summary.approval_rate_percentage}%):</strong> ${data.summary.rejected} requests rejected. Review common rejection reasons to improve request quality.`);
  } else {
    insights.push(`<strong>Moderate approval rate (${data.summary.approval_rate_percentage}%):</strong> ${data.summary.approved} approved, ${data.summary.rejected} rejected. Consider analyzing rejection patterns.`);
  }

  if (data.summary.avg_approval_time_hours > 3) {
    insights.push(`<strong>Processing time above target:</strong> Average ${data.summary.avg_approval_time_hours} hours to approve. Consider streamlining approval workflow or increasing approver capacity.`);
  } else if (data.summary.avg_approval_time_hours > 0) {
    insights.push(`<strong>Efficient processing:</strong> Average approval time of ${data.summary.avg_approval_time_hours} hours meets performance targets.`);
  }

  const activeResources = data.resource_utilization.filter(r => r.booking_count > 0).length;
  const utilizationRate = ((activeResources / data.resource_utilization.length) * 100).toFixed(1);
  
  if (utilizationRate < 50) {
    insights.push(`<strong>Low resource utilization (${utilizationRate}%):</strong> Only ${activeResources} of ${data.resource_utilization.length} resources were booked. Consider promoting underutilized resources or reviewing resource inventory.`);
  } else if (utilizationRate >= 75) {
    insights.push(`<strong>Strong resource utilization (${utilizationRate}%):</strong> ${activeResources} of ${data.resource_utilization.length} resources actively used - excellent engagement.`);
  } else {
    insights.push(`<strong>Moderate resource utilization (${utilizationRate}%):</strong> ${activeResources} of ${data.resource_utilization.length} resources booked this period.`);
  }

  const activeUsers = data.top_requesters.filter(u => u.total_requests > 0).length;
  const userEngagementRate = ((activeUsers / data.top_requesters.length) * 100).toFixed(1);
  
  if (userEngagementRate < 30) {
    insights.push(`<strong>Low user engagement (${userEngagementRate}%):</strong> Only ${activeUsers} of ${data.top_requesters.length} R01 users made requests. Consider awareness campaigns.`);
  } else if (userEngagementRate >= 60) {
    insights.push(`<strong>High user engagement (${userEngagementRate}%):</strong> ${activeUsers} of ${data.top_requesters.length} R01 users actively using the system.`);
  }

  const topDept = data.department_breakdown.filter(d => d.booking_count > 0)[0];
  if (topDept) {
    const topDeptShare = ((topDept.booking_count / data.summary.total_reservations) * 100).toFixed(1);
    if (topDeptShare > 25) {
      insights.push(`<strong>High department concentration:</strong> ${topDept.department} accounts for ${topDeptShare}% of all bookings. Ensure adequate capacity for this department.`);
    }
  }

  if (data.summary.pending > 10) {
    insights.push(`<strong>Pending backlog alert:</strong> ${data.summary.pending} requests awaiting approval. Review approver workload and escalate if necessary.`);
  }

  if (data.admin_performance && data.admin_performance.length > 0) {
    const fastestAdmin = data.admin_performance.reduce((min, admin) => 
      (admin.avg_processing_hours > 0 && admin.avg_processing_hours < (min?.avg_processing_hours || Infinity)) ? admin : min
    , null);
    
    if (fastestAdmin) {
      insights.push(`<strong>Fastest approver:</strong> ${fastestAdmin.name} averages ${parseFloat(fastestAdmin.avg_processing_hours).toFixed(1)} hours - consider as benchmark for team.`);
    }
  }

  if (insights.length < 3) {
    insights.push(`System operating within normal parameters for ${data.period.display}.`);
  }

  return insights;
}

function queryPromise(query, params) {
  const connection = require("../../controllers/database");
  return new Promise((resolve, reject) => {
    connection.query(query, params, (err, results) => {
      if (err) reject(err);
      else resolve(results || []);
    });
  });
}

module.exports = router;