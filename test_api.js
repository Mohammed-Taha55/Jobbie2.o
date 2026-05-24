const axios = require('axios');

async function testApi() {
  try {
    const api = axios.create({ baseURL: 'https://server-production-4f35.up.railway.app/api' });

    // 1. Register/Login
    console.log('Logging in...');
    const authRes = await api.post('/auth/register', {
      name: 'Test User',
      email: 'test_railway@test.com',
      password: 'password123'
    }).catch(err => api.post('/auth/login', {
      email: 'test_railway@test.com',
      password: 'password123'
    }));
    
    const token = authRes.data.token;
    console.log('Logged in! Token:', token);
    
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    // 2. Save credential
    console.log('Saving credential...');
    await api.post('/credentials', {
      platform: 'naukri',
      username: 'test_naukri',
      password: 'naukri_password'
    });
    console.log('Credential saved!');

    // 3. Fetch prereqs (like AutomatePage)
    console.log('Fetching prereqs...');
    const [credRes, resumeRes, statusRes] = await Promise.all([
      api.get('/credentials'),
      api.get('/resume'),
      api.get('/automation/status'),
    ]);
    console.log('Prereqs fetched successfully!');
    console.log('- Credentials:', credRes.data.credentials.length);
    console.log('- Resumes:', resumeRes.data.resumes.length);
    console.log('- Status:', statusRes.data.session ? 'Running' : 'None');
    
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}

testApi();
