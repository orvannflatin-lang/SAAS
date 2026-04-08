// Quick test script to add a Twitter account and trigger login
const axios = require('axios');

async function testTwitterLogin() {
    try {
        console.log('📝 Adding Twitter account...');
        
        // Add a Twitter account (without auth token to trigger manual login)
        const response = await axios.post('http://localhost:4000/api/twitter-accounts', {
            username: 'test_account',
            password: 'test_password',
            email: 'test@example.com',
            emailPassword: 'emailpass123',
            type: 'MAIN'
        });

        console.log('✅ Account created:', response.data.id);
        console.log('Account username:', response.data.username);
        
        // Trigger warmUp action to start the login flow
        console.log('\n🚀 Triggering warmUp action...');
        const actionResponse = await axios.post(`http://localhost:4000/api/twitter-accounts/${response.data.id}/action`, {
            action: 'warmUp'
        });

        console.log('✅ Job queued:', actionResponse.data.jobId);
        console.log('\n👁️ A browser window should open shortly for you to login manually.');
        console.log('⏳ You have 15 minutes to complete the login.');
        
    } catch (error) {
        if (error.response && error.response.data) {
            console.error('❌ Error:', error.response.data.error);
            if (error.response.data.error.includes('Unique constraint')) {
                console.log('\n💡 Account already exists. Fetching existing account...');
                
                // Get existing accounts
                const accounts = await axios.get('http://localhost:4000/api/twitter-accounts');
                if (accounts.data.length > 0) {
                    const account = accounts.data[0];
                    console.log('Using account:', account.username, account.id);
                    
                    console.log('\n🚀 Triggering warmUp action...');
                    const actionResponse = await axios.post(`http://localhost:4000/api/twitter-accounts/${account.id}/action`, {
                        action: 'warmUp'
                    });
                    
                    console.log('✅ Job queued:', actionResponse.data.jobId);
                    console.log('\n👁️ A browser window should open shortly for you to login manually.');
                }
            }
        } else {
            console.error('❌ Error:', error.message);
        }
    }
}

testTwitterLogin();
