import mongoose from "mongoose";

const auctionSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  startPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  currentPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  currentHighestBidId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Bid",
    default: null,
  },
  currentHighestBidderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  bidCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  buyNowPrice: {
    type: Number,
    default: null,
    min: 0,
  },
  priceStep: {
    type: Number,
    required: true,
    min: 1000,
  },
  startAt: {
    type: Date,
    required: true,
  },
  endAt: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ["scheduled", "active", "ended", "cancelled"],
    default: "scheduled",
  },
  autoExtendEnabled: {
    type: Boolean,
    default: false,
  },
  autoExtendWindowSec: {
    type: Number,
    default: 300,
  },
  autoExtendAmountSec: {
    type: Number,
    default: 600,
  },
  lastExtendedAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  /**
   * API 3.1: Tư động gia hạn
   * Hệ thống tự động
   */
  autoExtendCount: {
    type: Number,
    default: 0,
  },
  autoExtendHistory: [
    {
      extendedAt: Date,
      oldEndTime: Date,
      newEndTime: Date,
      triggeredByBidId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Bid",
      },
      _id: false,
    },
  ],

  /**
   * API 3.1: Tự động gia hạn
   * Seller chủ động gia hạn
   */
  sellerExtendCount: {
    type: Number,
    default: 0,
    max: 3,
  },
});

// Indexes
auctionSchema.index({ status: 1, endAt: 1 });
auctionSchema.index({ endAt: 1 });
auctionSchema.index({ productId: 1 });
auctionSchema.index({ currentHighestBidderId: 1 });
auctionSchema.index({ status: 1, endAt: 1, bidCount: -1 });

// Performance Indexes
auctionSchema.index({ status: 1, currentPrice: 1 });
auctionSchema.index({ status: 1, currentPrice: -1 });
auctionSchema.index({ status: 1, bidCount: -1 });
auctionSchema.index({ status: 1, createdAt: -1 });
// Dashboard specific indexes
auctionSchema.index({ sellerId: 1, status: 1, createdAt: -1 }); // For getSellingAuctions
// Optimized for getSoldAuctions (Sort by endAt, then filter by bidder)
auctionSchema.index({
  sellerId: 1,
  status: 1,
  endAt: -1,
  currentHighestBidderId: 1,
});
auctionSchema.index({ currentHighestBidderId: 1, status: 1, endAt: -1 }); // For getWonAuctions

// Update updatedAt on save
auctionSchema.pre("save", function () {
  this.updatedAt = Date.now();
});

export default mongoose.model("Auction", auctionSchema);
