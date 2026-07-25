// SERVICE: Auction Service

import { Auction, Product, Bid, Order, User } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { AUCTION_STATUS, ORDER_STATUS } from '../lib/constants.js';
import {
  sendAuctionEndedNoWinnerNotification,
  sendAuctionEndedSellerNotification,
  sendAuctionWinnerNotification
} from '../utils/email.js';

export class AuctionService {
  /**
   * Tạo cuộc đấu giá cho một sản phẩm
   * @param {string} productId - ID sản phẩm
   * @param {Object} auctionData - { startPrice, priceStep, startAt, endAt, buyNowPrice, autoExtendEnabled }
   * @returns {Object} Cuộc đấu giá mới được tạo
   */
  async createAuction(productId, auctionData) {
    // 1. Kiểm tra sản phẩm tồn tại
    const product = await Product.findById(productId);
    if (!product) {
      throw new AppError('Sản phẩm không tồn tại', 404);
    }

    // 2. Kiểm tra sản phẩm đã có cuộc đấu giá active chưa
    const existingAuction = await Auction.findOne({
      productId,
      status: { $in: [AUCTION_STATUS.SCHEDULED, AUCTION_STATUS.ACTIVE] }
    });
    if (existingAuction) {
      throw new AppError('Sản phẩm này đã có cuộc đấu giá đang hoạt động', 400);
    }

    // 3. Tạo auction mới
    const auction = new Auction({
      productId,
      sellerId: product.sellerId,
      startPrice: auctionData.startPrice,
      currentPrice: auctionData.startPrice,
      priceStep: auctionData.priceStep,
      startAt: new Date(auctionData.startAt),
      endAt: new Date(auctionData.endAt),
      buyNowPrice: auctionData.buyNowPrice || null,
      autoExtendEnabled: auctionData.autoExtendEnabled || false,
      status: AUCTION_STATUS.SCHEDULED
    });

    await auction.save();

    return auction;
  }

  /**
   * Cập nhật status cuộc đấu giá từ SCHEDULED sang ACTIVE
   * (Thường được gọi bởi cron job khi thời gian bắt đầu tới)
   * @param {string} auctionId - ID cuộc đấu giá
   */
  async activateAuction(auctionId) {
    const auction = await Auction.findByIdAndUpdate(
      auctionId,
      { status: AUCTION_STATUS.ACTIVE, updatedAt: new Date() },
      { new: true }
    );
    return auction;
  }

  /**
   * Kết thúc cuộc đấu giá
   * Tạo Order nếu có highest bidder
   * @param {string} auctionId - ID cuộc đấu giá
   * @returns {Object} Thông tin auction và order (nếu có)
   */
  async endAuction(auctionId) {
    const auction = await Auction.findById(auctionId);
    if (!auction) {
      throw new AppError('Cuộc đấu giá không tồn tại', 404);
    }

    // Đánh dấu auction là ended
    auction.status = AUCTION_STATUS.ENDED;
    await auction.save();

    let order = null;

    // Nếu có highest bidder, tạo Order
    if (auction.currentHighestBidderId) {
      order = new Order({
        auctionId: auction._id,
        productId: auction.productId,
        buyerId: auction.currentHighestBidderId,
        sellerId: auction.sellerId,
        finalPrice: auction.currentPrice,
        currency: 'VND',
        status: ORDER_STATUS.AWAITING_PAYMENT
      });
      await order.save();
    }

    // Send Auction End Emails (Fire and forget)
    (async () => {
        try {
            const seller = await User.findById(auction.sellerId);
            const product = await Product.findById(auction.productId);
            const productUrl = `${process.env.FRONTEND_URL}/product/${auction.productId}`;
             
            if (!auction.currentHighestBidderId) {
                // No winner
                if (seller) {
                    await sendAuctionEndedNoWinnerNotification({
                        sellerEmail: seller.email,
                        sellerName: seller.fullName,
                        productTitle: product ? product.title : 'Product',
                        startPrice: auction.startPrice,
                        startTime: auction.startAt,
                        endTime: auction.endAt,
                        productUrl: productUrl
                    });
                }
            } else {
                // Has winner
                const winner = await User.findById(auction.currentHighestBidderId);
                const orderUrl = `${process.env.FRONTEND_URL}/product/${auction.productId}`;

                if (seller && winner) {
                    // Email to Seller
                    await sendAuctionEndedSellerNotification({
                        sellerEmail: seller.email,
                        sellerName: seller.fullName,
                        productTitle: product ? product.title : 'Product',
                        winnerName: winner.fullName,
                        winnerEmail: winner.email,
                        winnerPhone: winner.phoneNumber || 'N/A',
                        finalPrice: auction.currentPrice,
                        startPrice: auction.startPrice,
                        totalBids: auction.bidCount,
                        endTime: auction.endAt,
                        orderUrl: orderUrl 
                    });

                    // Email to Winner
                    await sendAuctionWinnerNotification({
                        winnerEmail: winner.email,
                        winnerName: winner.fullName,
                        productTitle: product ? product.title : 'Product',
                        finalPrice: auction.currentPrice,
                        sellerName: seller.fullName,
                        sellerEmail: seller.email,
                        sellerPhone: seller.phoneNumber || 'N/A',
                        totalBids: auction.bidCount,
                        endTime: auction.endAt,
                        orderUrl: orderUrl
                    });
                }
            }
        } catch (err) {
            console.error("Error sending auction end notifications:", err);
        }
    })();

    return { auction, order };
  }

  /**
   * Lấy danh sách cuộc đấu giá đang hoạt động (sắp kết thúc)
   * @param {number} limit - Số lượng (mặc định 5)
   * @returns {Array} Danh sách cuộc đấu giá
   */
  async getEndingSoonAuctions(limit = 5) {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    return await Auction.find({
      status: AUCTION_STATUS.ACTIVE,
      endAt: { $gt: now, $lte: sevenDaysFromNow }
    })
      .populate('productId', 'title primaryImageUrl')
      .populate('currentHighestBidderId', 'username')
      .sort({ endAt: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Lấy danh sách cuộc đấu giá có nhiều bids nhất
   * @param {number} limit - Số lượng (mặc định 5)
   * @returns {Array} Danh sách cuộc đấu giá
   */
  async getMostBidsAuctions(limit = 5) {
    const auctions = await Auction.find({
      status: AUCTION_STATUS.ACTIVE
    })
      .populate('productId', 'title primaryImageUrl')
      .populate('currentHighestBidderId', 'username')
      .sort({ bidCount: -1 })
      .limit(limit)
      .lean();

    return auctions;
  }

  /**
   * Lấy danh sách cuộc đấu giá có lượt xem nhiều nhất (Trending)
   * @param {number} limit - Số lượng (mặc định 5)
   * @returns {Array} Danh sách cuộc đấu giá
   */
  async getMostViewedAuctions(limit = 5) {
    // Sử dụng Aggregation để join và sort chính xác theo views của Product
    const auctions = await Auction.aggregate([
      // 1. Chỉ lấy các auction đang active
      { $match: { status: AUCTION_STATUS.ACTIVE } },
      
      // 2. Lookup để lấy thông tin Product
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      
      // 3. Unwind mảng product
      { $unwind: '$product' },
      
      // 4. Chỉ lấy auction của product active
      { $match: { 'product.isActive': true } },

      // NEW: Project fields needed for sorting and display ONLY
      // This prevents carrying heavy fields like descriptionHistory through the pipeline
      {
        $project: {
             _id: 1,
             currentPrice: 1,
             bidCount: 1,
             endAt: 1,
             startPrice: 1, // Sometimes used for display
             currentHighestBidderId: 1,
             status: 1,
             // Product fields needed:
             "product._id": 1,
             "product.title": 1,
             "product.primaryImageUrl": 1,
             "product.slug": 1,
             "product.views": 1
        }
      },
      
      // 5. Sort theo product.views giảm dần
      { $sort: { 'product.views': -1 } },
      
      // 6. Limit số lượng
      { $limit: limit },
      
      // 7. Lookup thông tin bidder
      {
        $lookup: {
          from: 'users',
          localField: 'currentHighestBidderId',
          foreignField: '_id',
          as: 'currentHighestBidder'
        }
      },
      
      // 8. Unwind bidder
      {
        $unwind: {
          path: '$currentHighestBidder',
          preserveNullAndEmptyArrays: true
        }
      },

      // 9. Final Projection / Add Fields to match legacy structure
      {
        $addFields: {
          productId: {
               // Reconstruct productId object as if it was populated
               _id: "$product._id",
               title: "$product.title",
               primaryImageUrl: "$product.primaryImageUrl",
               slug: "$product.slug",
               views: "$product.views"
          },
          // Map bidder fields
          currentHighestBidderId: {
               _id: "$currentHighestBidder._id",
               username: "$currentHighestBidder.username"
          }
        }
      },
      
      // Remove temporary fields
      { $project: { product: 0, currentHighestBidder: 0 } }
    ]);

    return auctions;
  }

  /**
   * Lấy danh sách cuộc đấu giá có giá cao nhất
   * @param {number} limit - Số lượng (mặc định 5)
   * @returns {Array} Danh sách cuộc đấu giá
   */
  async getHighestPriceAuctions(limit = 5) {
    const auctions = await Auction.find({
      status: AUCTION_STATUS.ACTIVE
    })
      .populate('productId', 'title primaryImageUrl')
      .populate('currentHighestBidderId', 'username')
      .sort({ currentPrice: -1 })
      .limit(limit)
      .lean();

    return auctions;
  }

  /**
   * Lấy thông tin chi tiết cuộc đấu giá
   * @param {string} auctionId - ID cuộc đấu giá
   * @returns {Object} Thông tin auction đầy đủ
   */
  async getAuctionDetail(auctionId) {
    const auction = await Auction.findById(auctionId)
      .populate('productId')
      .populate('sellerId', 'username email ratingSummary')
      .populate('currentHighestBidderId', 'username ratingSummary');

    if (!auction) {
      throw new AppError('Cuộc đấu giá không tồn tại', 404);
    }

    return auction;
  }

  /**
   * Hủy cuộc đấu giá
   * @param {string} auctionId - ID cuộc đấu giá
   * @param {string} reason - Lý do hủy
   */
  async cancelAuction(auctionId, reason = '') {
    const auction = await Auction.findByIdAndUpdate(
      auctionId,
      {
        status: AUCTION_STATUS.CANCELLED,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!auction) {
      throw new AppError('Cuộc đấu giá không tồn tại', 404);
    }

    // TODO: Gửi notification cho tất cả bidders
    return auction;
  }
  /**
   * Lấy danh sách cuộc đấu giá (generic)
   * @param {Object} params - { page, limit, status, sort }
   */
  async getAuctions({ page = 1, limit = 10, status, sort }) {
    const query = {};
    if (status) query.status = status;

    const sortOption = {};
    if (sort) {
       const parts = sort.split(':');
       const field = parts[0];
       const order = parts[1] === 'desc' ? -1 : 1;
       sortOption[field] = order;
       // Handle simple -createdAt syntax from frontend
       if (sort.startsWith('-')) {
           sortOption[sort.substring(1)] = -1;
       } else {
           sortOption[sort] = 1;
       }
    } else {
        sortOption.createdAt = -1;
    }

    const auctions = await Auction.find(query)
      .populate('productId', 'title primaryImageUrl')
      .populate('currentHighestBidderId', 'username')
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Auction.countDocuments(query);

    return { auctions, total, page, pages: Math.ceil(total / limit) };
  }
}

export const auctionService = new AuctionService();
