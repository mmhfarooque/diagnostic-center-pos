import mongoose from 'mongoose';

let isConnected = false;

export async function connectMongo(uri = process.env.MONGODB_URI) {
  if (!uri) {
    return false;
  }
  if (isConnected) {
    return true;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      bufferCommands: false
    });
    isConnected = true;
    console.log(' connected to MongoDB Atlas cluster');
    return true;
  } catch (err) {
    console.warn('⚠️ MongoDB connection failed, falling back to SQLite:', err.message);
    return false;
  }
}
