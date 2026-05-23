const mongoose = require('mongoose');

const jobSearchSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    platform: {
      type: String,
      enum: ['naukri', 'indeed', 'linkedin'],
      required: true,
    },
    credentialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlatformCredential',
      required: true,
    },
    resumeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resume',
      required: true,
    },
    keywords: {
      type: String,
      required: [true, 'Keywords are required'],
      trim: true,
    },
    location: {
      type: String,
      default: '',
      trim: true,
    },
    experience: {
      type: String,
      enum: ['fresher', '1-3', '3-5', '5-10', '10+', 'any'],
      default: 'any',
    },
    jobType: {
      type: String,
      enum: ['remote', 'hybrid', 'onsite', 'any'],
      default: 'any',
    },
    maxApplications: {
      type: Number,
      default: 10,
      min: 1,
      max: 50,
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'stopped', 'failed'],
      default: 'pending',
    },
    stats: {
      applied: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      duplicate: { type: Number, default: 0 },
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('JobSearch', jobSearchSchema);
