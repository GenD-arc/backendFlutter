const express = require('express');
const app = express();
const PORT = process.env.PORT || 4000;
const cors = require('cors');
const http = require('http');
const server = http.createServer(app);
const NotificationWebSocketServer = require('./websocket-server');
const cron = require('node-cron');
const cleanupExpiredReservations = require('./routes/cleanupExpiredReservations');

const notificationServer = new NotificationWebSocketServer(server);
const { verifyToken } = require('./middleware/auth');

// Routes
const addUserRouter = require('./routes/superadmin/userManagement/addUser');
const viewUsersRouter = require('./routes/superadmin/userManagement/viewUsers');
const updateUserRouter = require('./routes/superadmin/userManagement/updateUser');
const deleteUserRouter = require('./routes/superadmin/userManagement/deleteUser');
const addResourceRouter = require('./routes/superadmin/resourceManagement/addResource');
const viewResourceRouter = require('./routes/superadmin/resourceManagement/viewResources');
const updateResourceRouter = require('./routes/superadmin/resourceManagement/updateResource');
const deleteResourceRouter = require('./routes/superadmin/resourceManagement/deleteResource');
const workflowRouter = require('./routes/superadmin/workflows');
const requestReservationRouter = require('./routes/user/requestReservation');
const viewReservationsRouter = require('./routes/user/viewReservation');
const cancelReservationRouter = require('./routes/user/cancelReservation');
const reservationHistoryRouter = require('./routes/admin/reservationHistory');
const viewPendingReservationsRouter = require('./routes/admin/viewPendingReservations');
const approveReservationRouter = require('./routes/admin/approveReservation');
const approvalLogsRouter = require('./routes/admin/approvalLogs');
const loginRouter = require('./routes/login');
const viewReservationStatusRouter = require('./routes/viewReservationStatus');
const checkAvailabilityRouter = require('./routes/user/checkResourceAvailability');
const dailySlotsRouter = require('./routes/dailySlots');
const generalResourcesRouter = require('./routes/resources');
const publicCalendarRouter = require('./routes/calendar');
const getAllPendingForApproverRouter = require('./routes/admin/getAllPendingForApprover');
const todayStatusRouter = require('./routes/todayStatus');
const monthlyReportsRouter = require('./routes/superadmin/monthlyReports');
const generateReportPDFRouter = require('./routes/superadmin/generateReportPDF');

app.use(express.static('public'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Unprotected routes
app.use('/api/login', loginRouter);
app.use('/api/resources/availability', checkAvailabilityRouter);
app.use('/api/resources/schedule', checkAvailabilityRouter);
app.use('/api/public/calendar', publicCalendarRouter);
app.use('/api/public/today-status', todayStatusRouter);

// Protected routes
app.use('/api/user/requestReservation', verifyToken, requestReservationRouter);
app.use('/api/user/viewReservation', verifyToken, viewReservationsRouter);
app.use('/api/user/cancelReservation', verifyToken, cancelReservationRouter);
app.use('/api/reservations/history', verifyToken, reservationHistoryRouter);
app.use('/api/admin/viewPendingReservations', verifyToken, viewPendingReservationsRouter);
app.use('/api/admin/approveReservation', verifyToken, approveReservationRouter);
app.use('/api/admin/approval-logs', verifyToken, approvalLogsRouter);
app.use('/api/reservations/status', verifyToken, viewReservationStatusRouter);
app.use('/api/reservations', verifyToken, dailySlotsRouter);
app.use('/api/resources', verifyToken, generalResourcesRouter);
app.use('/api/admin/getAllPendingForApprover', verifyToken, getAllPendingForApproverRouter);
app.use('/api/superadmin/reports', verifyToken, monthlyReportsRouter);
app.use('/api/superadmin/reports', verifyToken, generateReportPDFRouter);

// Superadmin routes
app.use('/api/superadmin/addUser', addUserRouter);
app.use('/api/superadmin/viewUsers', viewUsersRouter);
app.use('/api/superadmin/updateUser', updateUserRouter);
app.use('/api/superadmin/deleteUser', deleteUserRouter);
app.use('/api/superadmin/addResources', addResourceRouter);
app.use('/api/superadmin/viewResources', viewResourceRouter);
app.use('/api/superadmin/updateResource', updateResourceRouter);
app.use('/api/superadmin/deleteResource', deleteResourceRouter);
app.use('/api/superadmin/workflows', workflowRouter);

app.locals.notificationServer = notificationServer;

cron.schedule('0 0 * * *', async () => {
  await cleanupExpiredReservations();
}, {
  timezone: "Asia/Manila" // Philippine timezone
});

(async () => {
  await cleanupExpiredReservations();
})();

app.post('/api/admin/manual-cleanup', verifyToken, async (req, res) => {
  try {
    const result = await cleanupExpiredReservations();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});