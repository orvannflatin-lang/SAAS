// Trigger action for existing account
const axios = require('axios');

async function triggerAction() {
    try {
        // Get accounts
        const accounts = await axios.get('http://localhost:4000/api/twitter-accounts');
        if (accounts.data.length === 0) {
            console.log('No accounts found!');
            return;
        }
        
        const account = accounts.data[0];
        console.log(`🚀 Triggering warmUp for ${account.username}...`);
        
        const response = await axios.post(`http://localhost:4000/api/twitter-accounts/${account.id}/action`, {
            action: 'warmUp'
        });
        
        console.log('✅ Job queued:', response.data.jobId);
        console.log('👁️ Browser should open soon...');
        
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

triggerAction();
