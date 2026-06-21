const mongoose = require('mongoose');

const applicationLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    searchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobSearch',
    },
    platform: {
      type: String,
      enum: ['naukri', 'indeed', 'linkedin', 'iimjobs', 'instahyre', 'foundit'],
      required: true,
    },
    jobTitle: {
      type: String,
      required: true,
      trim: true,
    },
    company: {
      type: String,
      default: 'Unknown',
      trim: true,
    },
    location: {
      type: String,
      default: '',
      trim: true,
    },
    jobUrl: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['applied', 'skipped', 'failed', 'duplicate'],
      required: true,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Index for fast duplicate checking
applicationLogSchema.index({ userId: 1, jobUrl: 1 });
applicationLogSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('ApplicationLog', applicationLogSchema);
