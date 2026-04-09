// Test script to manually trigger activity logging
const axios = require('axios');

async function testActivityLogging() {
    const accountId = '68df9b7e-b827-4e02-9f87-a07860e86106'; // DlnHack1
    
    console.log('📝 Creating test activities...\n');

    // Create several test activities
    const actions = [
        { action: 'autoLike', message: 'Liked 8 posts about onlyfans' },
        { action: 'autoFollow', message: 'Followed 5 content creators' },
        { action: 'autoComment', message: 'Commented on 3 posts' },
        { action: 'autoPost', message: 'Posted a new tweet' },
        { action: 'autoRetweet', message: 'Retweeted 2 posts' },
    ];

    for (const { action, message } of actions) {
        try {
            const response = await axios.post('http://localhost:4000/api/activities', {
                accountId,
                action,
                message,
                status: 'SUCCESS',
                details: { test: true }
            });
            console.log(`✅ Created: ${action}`);
        } catch (error) {
            console.error(`❌ Failed: ${action}`, error.message);
        }
    }

    console.log('\n📊 Fetching statistics...');
    try {
        const statsResponse = await axios.get(`http://localhost:4000/api/twitter-stats/${accountId}?days=30`);
        console.log('📈 Statistics:', JSON.stringify(statsResponse.data, null, 2));
    } catch (error) {
        console.error('❌ Failed to fetch stats:', error.message);
    }

    console.log('\n📋 Fetching activities...');
    try {
        const activitiesResponse = await axios.get('http://localhost:4000/api/activities?limit=10');
        console.log(`Found ${activitiesResponse.data.length} activities:`);
        activitiesResponse.data.forEach((activity, index) => {
            console.log(`  ${index + 1}. ${activity.action} - ${activity.message}`);
        });
    } catch (error) {
        console.error('❌ Failed to fetch activities:', error.message);
    }
}

testActivityLogging();
