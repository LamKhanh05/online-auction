import mongoose from 'mongoose';

// ========================================
// Product Schema (API 1.3, 1.4, 1.5)
// Đại diện cho sản phẩm trong hệ thống đấu giá
// ========================================

const productSchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  // API 1.4: Tên sản phẩm (dùng cho full-text search)
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  slug: {
    type: String,
    required: true,
    lowercase: true
  },
  // API 1.5: Lịch sử mô tả sản phẩm
  descriptionHistory: [
    {
      text: String,
      createdAt: {
        type: Date,
        default: Date.now
      },
      authorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      _id: false
    }
  ],
  // API 1.3, 1.5: Hình ảnh chính
  primaryImageUrl: {
    type: String,
    required: true
  },
  // API 1.3, 1.5: Danh sách ảnh bổ sung
  imageUrls: {
    type: [String],
    validate: {
      validator: (v) => v.length >= 3,
      message: 'At least 3 images are required'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // API 1.6: View Count
  views: {
    type: Number,
    default: 0
  },
  // API 4.2: Archive support
  isArchived: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  flags: {
    featured: {
      type: Boolean,
      default: false
    },
    highlightedUntil: {
      type: Date,
      default: null
    },
    isNewUntil: {
      type: Date,
      default: null
    },
    _id: false
  },
  baseCurrency: {
    type: String,
    default: 'VND'
  },
  // API 1.5: Metadata sản phẩm
  metadata: {
    brand: String,
    model: String,
    condition: String,
    warranty: String,
    tags: [String],
    specs: mongoose.Schema.Types.Mixed
  },
  // Bidder approval configuration
  requireBidderApproval: {
    type: Boolean,
    default: true
  },
  approvedBidders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// ========================================
// INDEXES (Quan trọng cho performance)
// ========================================
// API 1.4: Text index cho full-text search - bao gồm title, brand, model, condition
productSchema.index({
  title: 'text',
  'metadata.brand': 'text',
  'metadata.model': 'text',
  'metadata.condition': 'text'
});
// API 1.3: Query theo danh mục + thời gian
productSchema.index({ categoryId: 1, createdAt: -1 });
productSchema.index({ isActive: 1, categoryId: 1 });
// Lọc theo người bán
productSchema.index({ sellerId: 1 });
productSchema.index({ sellerId: 1, isActive: 1 });
// Lọc theo trạng thái active
productSchema.index({ isActive: 1 });
// API 1.2: Sort theo views (Trending)
productSchema.index({ views: -1 });

// Update updatedAt on save
productSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

export default mongoose.model('Product', productSchema);
