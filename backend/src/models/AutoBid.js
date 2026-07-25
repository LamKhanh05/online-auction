import mongoose from 'mongoose';

const autoBidSchema = new mongoose.Schema({
  auctionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Auction',
    required: true
  },
  bidderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  maxAmount: {
    type: Number,
    required: true,
    min: 0
  },
  active: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
autoBidSchema.index({ auctionId: 1, maxAmount: -1 });
autoBidSchema.index({ bidderId: 1 });
autoBidSchema.index({ auctionId: 1, bidderId: 1 }, { unique: true });
autoBidSchema.index({ auctionId: 1, active: 1, maxAmount: -1, updatedAt: 1 });

// Update updatedAt on save
autoBidSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

export default mongoose.model('AutoBid', autoBidSchema);
