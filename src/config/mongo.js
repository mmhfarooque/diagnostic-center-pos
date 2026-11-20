let mongooseInstance = null;

export async function connectMongo(uri = process.env.MONGODB_URI) {
  if (!uri) {
    return false;
  }
  try {
    if (!mongooseInstance) {
      const mod = await import('mongoose');
      mongooseInstance = mod.default || mod;
    }
    if (mongooseInstance.connection?.readyState === 1) {
      return true;
    }
    await mongooseInstance.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      bufferCommands: false
    });
    console.log('✓ Connected to MongoDB Atlas cluster');
    return true;
  } catch (err) {
    console.warn('⚠️ MongoDB connection note:', err.message);
    return false;
  }
}
