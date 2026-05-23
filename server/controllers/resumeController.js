const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Resume = require('../models/Resume');

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${req.user._id}_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// @desc    Upload resume
// @route   POST /api/resume/upload
const uploadResume = [
  upload.single('resume'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a PDF file' });
    }

    // If this is first resume, set as default
    const count = await Resume.countDocuments({ userId: req.user._id });

    const resume = await Resume.create({
      userId: req.user._id,
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      mimeType: req.file.mimetype,
      isDefault: count === 0,
    });

    res.status(201).json({ success: true, message: 'Resume uploaded successfully', resume });
  },
];

// @desc    Get all resumes
// @route   GET /api/resume
const getResumes = async (req, res) => {
  const resumes = await Resume.find({ userId: req.user._id }).sort('-createdAt');
  res.json({ success: true, resumes });
};

// @desc    Set default resume
// @route   PATCH /api/resume/:id/default
const setDefault = async (req, res) => {
  await Resume.updateMany({ userId: req.user._id }, { isDefault: false });
  const resume = await Resume.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { isDefault: true },
    { new: true }
  );

  if (!resume) return res.status(404).json({ success: false, message: 'Resume not found' });

  res.json({ success: true, message: 'Default resume updated', resume });
};

// @desc    Delete resume
// @route   DELETE /api/resume/:id
const deleteResume = async (req, res) => {
  const resume = await Resume.findOneAndDelete({ _id: req.params.id, userId: req.user._id });

  if (!resume) return res.status(404).json({ success: false, message: 'Resume not found' });

  // Delete file from disk
  if (fs.existsSync(resume.path)) fs.unlinkSync(resume.path);

  res.json({ success: true, message: 'Resume deleted' });
};

module.exports = { uploadResume, getResumes, deleteResume, setDefault };
