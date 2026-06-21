const mongoose = require('mongoose');

const platformCredentialSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    platform: {
      type: String,
      enum: ['naukri', 'indeed', 'linkedin', 'iimjobs', 'instahyre', 'foundit'],
      required: true,
    },
    username: {
      type: String,
      required: [true, 'Username / email is required'],
      trim: true,
    },
    encryptedPassword: {
      type: String,
      required: [true, 'Password is required'],
    },
    label: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

// Unique credential per user per platform
platformCredentialSchema.index({ userId: 1, platform: 1 }, { unique: true });

module.exports = mongoose.model('PlatformCredential', platformCredentialSchema);
