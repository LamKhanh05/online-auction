import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  emailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerifiedAt: {
    type: Date,
    default: null,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  fullName: {
    type: String,
    trim: true,
  },
  dateOfBirth: {
    type: Date,
    default: null,
  },
  contactPhone: {
    type: String,
    default: null,
  },
  address: {
    street: String,
    ward: String,
    district: String,
    city: String,
    region: String,
    postalCode: String,
    country: String,
    _id: false,
  },
  roles: {
    type: [String],
    enum: ["bidder", "seller", "admin", "superadmin"],
    default: ["bidder"],
  },
  // API 2.6: Seller role expiration (7 days)
  sellerExpiresAt: {
    type: Date,
  },
  ratingSummary: {
    countPositive: {
      type: Number,
      default: 0,
    },
    countNegative: {
      type: Number,
      default: 0,
    },
    totalCount: {
      type: Number,
      default: 0,
    },
    score: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
    _id: false,
  },
  ratingDetailsRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Rating",
    default: null,
  },
  socialIds: {
    googleId: String,
    facebookId: String,
    githubId: String,
    _id: false,
  },
  otp: {
    code: String,
    expiresAt: Date,
    newEmail: String,
    _id: false,
  },
  profileImageUrl: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    enum: ["active", "suspended", "banned"],
    default: "active",
  },
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Indexes (email và username đã có unique: true trong schema, không cần định nghĩa lại)
userSchema.index({ roles: 1 });
userSchema.index({ roles: 1, sellerExpiresAt: 1 });
userSchema.index({ "ratingSummary.score": -1 });

// Update updatedAt on save
userSchema.pre("save", function () {
  this.updatedAt = Date.now();
});

export default mongoose.model("User", userSchema);
