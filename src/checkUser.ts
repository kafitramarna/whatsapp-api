// Quick script to check/create admin user
import 'reflect-metadata';
import { sequelize } from './config/database';
import { User } from './models/User';

async function checkUser() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database');
    
    const users = await User.findAll();
    console.log(`📊 Users in database: ${users.length}`);
    
    if (users.length === 0) {
      console.log('➕ No users found, creating admin...');
      const admin = await User.create({
        username: 'admin',
        password: 'admin123',
      });
      console.log('');
      console.log('============================================================');
      console.log('🔐 ADMIN USER CREATED');
      console.log('============================================================');
      console.log('Username: admin');
      console.log('Password: admin123');
      console.log(`API Key: ${admin.api_key}`);
      console.log('⚠️  Save your API Key now — it will NOT be shown again!');
      console.log('============================================================');
    } else {
      console.log('');
      console.log('============================================================');
      console.log('📋 EXISTING USERS:');
      console.log('============================================================');
      for (const user of users) {
        console.log(`Username: ${user.username}`);
        console.log(`API Key: ${user.getMaskedApiKey()}`);
        console.log('------------------------------------------------------------');
      }
    }
    
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkUser();
