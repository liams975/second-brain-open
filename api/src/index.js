require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ origin: 'http://localhost:3000' }));

app.use('/api/daily-progress', require('./routes/daily-progress'));
app.use('/api/focus', require('./routes/focus'));
app.use('/api/insights', require('./routes/insights'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/events', require('./routes/events'));
app.use('/api/people', require('./routes/people'));
app.use('/api/vault-stats', require('./routes/vault-stats'));

const { briefing, monthlyFocus } = require('./routes/briefing');
app.use('/api/briefing', briefing);
app.use('/api/monthly-focus', monthlyFocus);
app.use('/api/health', require('./routes/health'));
app.use('/api/ring', require('./routes/ring'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
