import mongoose from 'mongoose';

const bidSchema = new mongoose.Schema({
  auctionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Auction',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  bidderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  isAuto: {
    type: Boolean,
    default: false
  },
  // API 3.3: Đánh dấu bid bị invalidate khi bidder bị reject
  isValid: {
    type: Boolean,
    default: true
  },
  invalidatedAt: {
    type: Date
  },
  invalidatedReason: {
    type: String
  },
  metadata: {
    proxyFor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
bidSchema.index({ auctionId: 1, createdAt: -1 });
bidSchema.index({ bidderId: 1, auctionId: 1 });
bidSchema.index({ productId: 1, createdAt: -1 });
bidSchema.index({ auctionId: 1, amount: -1 });
bidSchema.index({ auctionId: 1, isValid: 1, createdAt: -1 });

export default mongoose.model('Bid', bidSchema);
