// SERVICE: Bid Service (Core Business Logic)

import {
  Auction,
  Bid,
  AutoBid,
  RejectedBidder,
  SystemSetting,
  User,
  Product,
  Rating
} from "../models/index.js";
import mongoose from "mongoose";
import { AppError } from "../utils/errors.js";
import { AUCTION_STATUS, ERROR_CODES } from "../lib/constants.js";
import {
  sendBidSuccessNotification,
  sendPriceUpdatedNotification,
  sendOutbidNotification,
  sendBidRejectedNotification,
  sendAuctionWinnerNotification,
  sendAuctionEndedSellerNotification
} from '../utils/email.js';
import { notificationService } from './NotificationService.js';

export class BidService {
  /**
   * Đặt giá tự động (Auto Bid) cho sản phẩm
   * User thiết lập giá trần (maxAmount), hệ thống tự động bid
   * @param {string} auctionId - ID cuộc đấu giá
   * @param {string} bidderId - ID người đặt giá
   * @param {number} maxAmount - Mức giá tối đa user sẵn sàng trả
   * @returns {Object} { success, currentPrice, currentHighestBidderId }
   */
  async placeBid(auctionId, bidderId, maxAmount) {
    // ✅ Đảm bảo maxAmount là số
    maxAmount = Number(maxAmount);

    console.log("[BID SERVICE] Place Auto Bid:", {
      auctionId,
      bidderId,
      maxAmount,
    });

    if (isNaN(maxAmount)) {
      throw new AppError("Số tiền đặt giá không hợp lệ", 400);
    }

    // 1. Lấy thông tin auction
    const auction = await Auction.findById(auctionId);
    if (!auction) {
      throw new AppError("Không tìm thấy cuộc đấu giá", 404);
    }

    // 2. Kiểm tra trạng thái
    if (auction.status !== AUCTION_STATUS.ACTIVE) {
      throw new AppError(
        "Cuộc đấu giá đã kết thúc hoặc không còn hoạt động",
        400,
        ERROR_CODES.AUCTION_NOT_ACTIVE
      );
    }

    const now = new Date();
    if (now > new Date(auction.endAt)) {
      throw new AppError(
        "Cuộc đấu giá đã kết thúc",
        400,
        ERROR_CODES.AUCTION_NOT_ACTIVE
      );
    }

    // 3. Fetch complex data in parallel: Product, Bidder, Rating stats, and Rejected Bidder check
    const [product, bidder, isRejected, ratingStats] = await Promise.all([
      Product.findById(auction.productId),
      User.findById(bidderId),
      RejectedBidder.findOne({ productId: auction.productId, bidderId: bidderId }),
      Rating.aggregate([
        { $match: { rateeId: new mongoose.Types.ObjectId(bidderId) } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            positive: { $sum: { $cond: [{ $eq: ["$score", 1] }, 1, 0] } }
          }
        }
      ])
    ]);

    if (!product) throw new AppError("Sản phẩm không tồn tại", 404);
    if (!bidder) throw new AppError("Không tìm thấy người dùng", 404);

    // 4. Kiểm tra Rejected Bidder
    console.log(`[BID SERVICE] Checking rejected bidder - productId: ${auction.productId}, bidderId: ${bidderId}`);
    console.log(`[BID SERVICE] Rejected check result:`, isRejected);
    if (isRejected) {
      throw new AppError(
        "Bạn không được phép tham gia đấu giá sản phẩm này",
        403,
        ERROR_CODES.BIDDER_REJECTED
      );
    }

    // Prevent Seller from bidding on their own product
    if (product.sellerId.toString() === bidderId.toString()) {
      throw new AppError("Bạn không thể tự đấu giá sản phẩm của chính mình", 403);
    }

    // --- RATING CALCULATION ---
    // 1. Real-time stats from Rating collection
    const realtimeStats = ratingStats[0] || { total: 0, positive: 0 };
    let realtimePercent = 0;
    if (realtimeStats.total > 0) {
      realtimePercent = (realtimeStats.positive / realtimeStats.total) * 100;
    }

    // 2. Cached stats from User Profile
    const profileStats = bidder.ratingSummary || { totalCount: 0, countPositive: 0 };
    let profilePercent = 0;
    if (profileStats.totalCount > 0) {
      profilePercent = (profileStats.countPositive / profileStats.totalCount) * 100;
    }

    // 3. Use the Best Rating available (Benefit of the doubt)
    const effectivePercent = Math.max(realtimePercent, profilePercent);
    const hasRatingData = realtimeStats.total > 0 || profileStats.totalCount > 0;

    // --- ELIGIBILITY LOGIC ---
    if (hasRatingData) {
      // Rule 1: Bidders with rating < 80% are BLOCKED globally (for quality control)
      if (effectivePercent < 80) {
        throw new AppError(
          `Điểm uy tín của bạn (${effectivePercent.toFixed(0)}%) thấp hơn mức yêu cầu (80%) để tham gia đấu giá.`,
          403,
          ERROR_CODES.RATING_TOO_LOW
        );
      }
      // Rule 2: Bidders with rating >= 80% are ALWAYS ALLOWED
      // (Proceed to bid)
    } else {
      // Rule 3: New Bidders (No Rating)
      // Condition: Allowed ONLY IF requireBidderApproval is FALSE (Open Mode)
      // OR if they are specifically Approved in whitelist

      if (product.requireBidderApproval) {
        // Restricted Mode: Check Whitelist
        const isApproved = product.approvedBidders && product.approvedBidders.some(id => id.toString() === bidderId.toString());

        if (!isApproved) {
          throw new AppError(
            "Sản phẩm này yêu cầu phê duyệt cho người mới. Vui lòng gửi yêu cầu tham gia.",
            403,
            "BIDDER_APPROVAL_REQUIRED"
          );
        }
      }
      // If requireBidderApproval is FALSE -> Allow New Bidder automatically
    }

    // 5. Validate Max Amount
    // Giá trần phải >= Giá hiện tại + Bước giá (nếu người khác đang giữ)
    // Hoặc >= Giá khởi điểm (nếu chưa ai bid)
    // Tuy nhiên, logic đúng là: User muốn trả TỐI ĐA bao nhiêu.
    // Nếu maxAmount < currentPrice, chắc chắn fail.
    // Nếu maxAmount < currentWinningBid (ẩn), sẽ thua ngay lập tức nhưng vẫn cho phép set?
    // Để đơn giản và tránh spam: Yêu cầu maxAmount >= Min Bid hợp lệ hiện tại.

    const minRequired = auction.currentPrice + auction.priceStep;
    // Nếu chưa có ai bid (currentPrice có thể là startPrice), thì min là startPrice?
    // Giả sử currentPrice luôn được init bằng startPrice khi tạo auction.

    // Logic: Nếu currentPrice = startPrice và bidCount = 0, thì được phép bid >= startPrice.
    // Nếu đã có bid, phải >= current + step.
    let minAllowed = minRequired;
    if (auction.bidCount === 0) {
      minAllowed = auction.startPrice;
    }

    if (maxAmount < minAllowed) {
      throw new AppError(
        `Giá đặt tối đa của bạn phải lớn hơn hoặc bằng ${minAllowed.toLocaleString(
          "vi-VN"
        )}đ`,
        400,
      );
    }

    // --- CHECK BUY NOW PRICE ---
    // API 6.3 - Nếu giá đặt >= Giá mua ngay -> Thắng ngay lập tức
    if (auction.buyNowPrice && maxAmount >= auction.buyNowPrice) {
      // Kiểm tra lại rejected bidder trước khi cho phép mua ngay
      console.log(`[BID SERVICE] Checking rejected for Buy Now - productId: ${auction.productId}, bidderId: ${bidderId}`);
      const isRejectedForBuyNow = await RejectedBidder.findOne({
        productId: auction.productId,
        bidderId: bidderId,
      });
      console.log(`[BID SERVICE] Buy Now rejected check result:`, isRejectedForBuyNow);
      if (isRejectedForBuyNow) {
        throw new AppError(
          "Bạn không được phép mua sản phẩm này (đã bị từ chối bởi người bán)",
          403,
          ERROR_CODES.BIDDER_REJECTED
        );
      }

      console.log(`[BID SERVICE] Buy Now Triggered! Bidder: ${bidderId}, Amount: ${auction.buyNowPrice}`);

      const session = await Auction.startSession();
      session.startTransaction();

      try {
        // 1. Tạo Bid chiến thắng với giá Buy Now
        const winBid = await Bid.create([{
          auctionId: auction._id,
          productId: auction.productId,
          bidderId: bidderId,
          amount: auction.buyNowPrice,
          isAuto: false, // Đây là manual action trigger buy now
          isValid: true,
          createdAt: new Date()
        }], { session });

        // 2. Chốt Auction ngay lập tức
        const now = new Date();
        const updatedAuction = await Auction.findByIdAndUpdate(
          auction._id,
          {
            status: AUCTION_STATUS.ENDED,
            currentPrice: auction.buyNowPrice,
            currentHighestBidderId: bidderId,
            currentHighestBidId: winBid[0]._id,
            endAt: now, // Kết thúc ngay
            bidCount: auction.bidCount + 1,
            updatedAt: now
          },
          { new: true, session }
        );

        await session.commitTransaction();

        // 3. Gửi thông báo chiến thắng & kết thúc (Background)
        (async () => {
          try {
            const product = await Product.findById(auction.productId);
            const seller = await User.findById(product.sellerId);

            // Gửi cho người thắng
            await sendAuctionWinnerNotification({
              winnerEmail: bidder.email,
              winnerName: bidder.fullName,
              productTitle: product.title,
              finalPrice: auction.buyNowPrice,
              sellerName: seller.fullName,
              sellerEmail: seller.email,
              sellerPhone: seller.phoneNumber || "N/A",
              totalBids: updatedAuction.bidCount,
              endTime: now,
              orderUrl: `${process.env.FRONTEND_URL}/product/${auction.productId}`
            });

            // Gửi cho người bán
            await sendAuctionEndedSellerNotification({
              sellerEmail: seller.email,
              sellerName: seller.fullName,
              productTitle: product.title,
              winnerName: bidder.fullName,
              winnerEmail: bidder.email,
              winnerPhone: bidder.phoneNumber || "N/A",
              finalPrice: auction.buyNowPrice,
              startPrice: auction.startPrice,
              totalBids: updatedAuction.bidCount,
              endTime: now,
              orderUrl: `${process.env.FRONTEND_URL}/product/${auction.productId}` // Link tới sản phẩm
            });

          } catch (mailErr) {
            console.error("[BID SERVICE] Error sending Buy Now notifications:", mailErr);
          }
        })();

        return {
          success: true,
          buyNowSuccess: true,
          currentPrice: auction.buyNowPrice,
          currentHighestBidderId: bidderId,
          bidCount: updatedAuction.bidCount,
          endAt: now,
          message: "Chúc mừng! Bạn đã thắng phiên đấu giá với giá Mua Ngay."
        };

      } catch (err) {
        await session.abortTransaction();
        throw err;
      } finally {
        session.endSession();
      }
    }

    // 6. Lưu AutoBid (Update nếu đã tồn tại, Create nếu chưa)
    // Dùng session transaction cho an toàn
    const session = await Auction.startSession();
    session.startTransaction();

    try {
      // Check existing bid to preserve priority
      const existingBid = await AutoBid.findOne({ auctionId, bidderId }).session(session);
      let updateFields = {
        maxAmount,
        active: true
      };

      // Only update timestamp if amount is DIFFERENT.
      // If amount is same, keep original timestamp to preserve "First Come First Serve" priority.
      if (!existingBid || existingBid.maxAmount !== maxAmount) {
        updateFields.updatedAt = new Date();
      }

      await AutoBid.findOneAndUpdate(
        { auctionId, bidderId },
        {
          maxAmount,
          active: true,
          updatedAt: new Date(),
        },
        { upsert: true, new: true, session }
      );

      // 7. Resolve Auction (Tính toán người thắng mới)
      const resolveResult = await this._resolveAuction(auction, session, bidderId);

      await session.commitTransaction();

      // --- Send Notifications (Background) ---
      // Don't await these to improve response time
      (async () => {
        try {
          // Fetch required data in parallel
          const [product, bidder] = await Promise.all([
            Product.findById(auction.productId),
            User.findById(bidderId)
          ]);
          
          if (!product) return;
          const seller = await User.findById(product.sellerId);

          // 1. Send Bid Success to the current bidder
          const isHighest = resolveResult.currentHighestBidderId?.toString() === bidderId.toString();
          await sendBidSuccessNotification({
            bidderEmail: bidder.email,
            bidderName: bidder.fullName,
            productTitle: product.title,
            bidAmount: maxAmount,
            currentPrice: resolveResult.currentPrice,
            isHighestBidder: isHighest,
            productUrl: `${process.env.FRONTEND_URL}/product/${auction.productId}`
          });

          // 2. Send Price Updated to Seller
          if (resolveResult.currentPrice !== auction.currentPrice) {
            await sendPriceUpdatedNotification({
              sellerEmail: seller.email,
              sellerName: seller.fullName,
              productTitle: product.title,
              previousPrice: auction.currentPrice,
              newPrice: resolveResult.currentPrice,
              bidderName: bidder.fullName,
              totalBids: resolveResult.bidCount,
              auctionUrl: `${process.env.FRONTEND_URL}/product/${auction.productId}`,
              auctionEndTime: resolveResult.endAt || auction.endAt
            });
          }

          // 3. Send Outbid Notification to previous winner
          const previousWinnerId = auction.currentHighestBidderId;
          const currentWinnerId = resolveResult.currentHighestBidderId;

          if (previousWinnerId && previousWinnerId.toString() !== currentWinnerId?.toString()) {
            if (previousWinnerId.toString() !== bidderId.toString()) {
              // Fetch previous winner info in parallel
              const [previousWinner, prevBid] = await Promise.all([
                User.findById(previousWinnerId),
                AutoBid.findOne({ auctionId: auction._id, bidderId: previousWinnerId })
              ]);

              if (previousWinner) {
                const yourBidAmount = prevBid ? prevBid.maxAmount : auction.currentPrice;

                // Email Notification
                await sendOutbidNotification({
                  previousBidderEmail: previousWinner.email,
                  previousBidderName: previousWinner.fullName,
                  productTitle: product.title,
                  yourBidAmount: yourBidAmount,
                  currentPrice: resolveResult.currentPrice,
                  productUrl: `${process.env.FRONTEND_URL}/product/${auction.productId}`,
                  auctionEndTime: resolveResult.endAt || auction.endAt
                });

                // In-App Notification (NEW)
                await notificationService.notifyBidOutbid({
                  previousBidderId: previousWinner._id,
                  previousBidderEmail: previousWinner.email,
                  productTitle: product.title,
                  newPrice: resolveResult.currentPrice,
                  productId: auction.productId,
                  auctionId: auction._id
                });
              }
            }
          }
        } catch (err) {
          console.error("[BID SERVICE] Error sending background notifications:", err);
        }
      })();

      return resolveResult;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Logic cốt lõi: Tính toán lại giá và người thắng dựa trên danh sách AutoBid
   * @param {Object} auction - Auction document
   * @param {Object} session - Mongoose session
   * @param {string} triggeringBidderId - ID của bidder vừa thực hiện hành động (để ghi log nếu thua)
   */
  async _resolveAuction(auction, session, triggeringBidderId = null) {
    const auctionId = auction._id;

    // 1. Lấy tất cả AutoBid active, sort giảm dần theo maxAmount, sau đó tăng dần theo time (ưu tiên người đến trước)
    const autoBids = await AutoBid.find({ auctionId, active: true })
      .sort({ maxAmount: -1, updatedAt: 1 })
      .session(session);

    if (autoBids.length === 0) {
      // 1.1 Reset auction state if no active bids remain
      await Auction.findByIdAndUpdate(
        auctionId,
        {
          currentPrice: auction.startPrice,
          currentHighestBidderId: null,
          currentHighestBidId: null,
          bidCount: 0,
          updatedAt: new Date(),
        },
        { session }
      );

      return {
        success: true,
        currentPrice: auction.startPrice,
        currentHighestBidderId: null,
        bidCount: 0,
      };
    }

    const highestBidder = autoBids[0];
    const secondBidder = autoBids[1]; // Có thể undefined nếu chỉ có 1 người

    // 2. Tính giá trần mới (New Price)
    let newPrice = auction.startPrice;

    // Biến để tracking xem người thắng có thay đổi không
    const isWinnerChanged =
      !auction.currentHighestBidderId ||
      auction.currentHighestBidderId.toString() !==
      highestBidder.bidderId.toString();

    if (secondBidder) {
      // Logic "Giá vừa đủ thắng":
      // 1. Nếu người nhất thay đổi (Người mới vào beat người cũ):
      //    Cần beat người thứ 2 một bước giá (hoặc khớp Max nếu không đủ bước).
      // 2. Nếu người nhất không đổi (Người cũ Defend):
      //    Chỉ cần Match giá của người thứ 2 là thắng (do Time ưu tiên).

      // Logic Consistent: 
      // 1. If Win is strictly higher than Second -> beat the second bidder by one price step (if possible)
      // 2. If Win is equal to Second (Tie) -> price is equal to Second (Time priority determines winner)
      if (highestBidder.maxAmount > secondBidder.maxAmount) {
        newPrice = secondBidder.maxAmount + auction.priceStep;
      } else {
        // Tie scenario: Winner is the one who bid first (by time), price is exactly second bidder's max
        newPrice = secondBidder.maxAmount;
      }

      // Cap giá không vượt quá Max của người thắng
      if (newPrice > highestBidder.maxAmount) {
        newPrice = highestBidder.maxAmount;
      }
    } else {
      // Chỉ có 1 người duy nhất duy nhất còn lại
      // Trong proxy bidding, nếu chỉ có 1 người, giá luôn quay về startPrice 
      // vì không có đối thủ cạnh tranh để đẩy giá lên.
      newPrice = auction.startPrice;
    }

    // 3. Chuẩn bị danh sách Bids để tạo (Lịch sử đấu giá)
    // Chúng ta muốn trong lịch sử hiện:
    // User B (Thua) - 10.8M
    // User A (Thắng) - 10.8M (Defend)
    const bidsToCreate = [];
    const now = new Date();

    // 3.1 Ghi nhận bid của người thua (Người vừa vào bid nhưng ko thắng)
    // Chỉ ghi nhận nếu triggeringBidderId tồn tại VÀ không phải là người thắng
    if (
      triggeringBidderId &&
      triggeringBidderId.toString() !== highestBidder.bidderId.toString()
    ) {
      // Tìm thông tin bid của người này trong autoBids (hoặc query lại nếu cần)
      // Trong logic này, người này chắc chắn nằm trong list autoBids (vì vừa placeBid/update)
      // Nhưng họ có thể là secondBidder, hoặc thứ 3, 4...
      const triggeringAutoBid = autoBids.find(
        (b) => b.bidderId.toString() === triggeringBidderId.toString()
      );

      if (triggeringAutoBid) {
        // Ghi nhận mức giá họ đã bid (Max Amount của họ)
        // Tuy nhiên, để lịch sử đẹp, ta nên ghi nhận mức giá họ "đẩy" lên.
        // Nhưng đơn giản nhất là ghi Max Amount của họ (như User yêu cầu: #2 10.8M)
        bidsToCreate.push({
          auctionId,
          productId: auction.productId,
          bidderId: triggeringBidderId,
          amount: triggeringAutoBid.maxAmount,
          isAuto: true,
          isValid: true,
          createdAt: new Date(now.getTime() - 100), // Trick: create earlier than winner
        });
      }
    }

    // 3.2 Ghi nhận bid của người thắng (Nếu giá thay đổi HOẶC người thắng thay đổi HOẶC có người vừa challenge)
    // Luôn ghi nhận bid mới của người thắng nếu có sự kiện xảy ra để cập nhật Price
    // Tuy nhiên, tránh spam history nếu không có gì thay đổi thực sự
    // Nhưng ở đây, nếu có triggeringBidderId (có người tác động), ta nên log lại phản ứng của winner.

    const shouldLogWinnerBid =
      isWinnerChanged ||
      auction.currentPrice !== newPrice ||
      (triggeringBidderId &&
        triggeringBidderId.toString() !== highestBidder.bidderId.toString());

    let winnerBidId = null;

    if (shouldLogWinnerBid) {
      // ✅ Check if this specific bid already exists to avoid duplication
      const existingBid = await Bid.findOne({
        auctionId,
        bidderId: highestBidder.bidderId,
        amount: newPrice,
        isValid: true,
      }).session(session);

      if (!existingBid) {
        const winnerBid = {
          auctionId,
          productId: auction.productId,
          bidderId: highestBidder.bidderId,
          amount: newPrice,
          isAuto: true,
          isValid: true,
          createdAt: now,
        };
        bidsToCreate.push(winnerBid);
      } else {
        // Reuse existing bid ID for auction update
        winnerBidId = existingBid._id;
      }
    }

    // Insert Bids
    if (bidsToCreate.length > 0) {
      // Fix: Khi create nhiều docs với session, Mongoose yêu cầu ordered: true
      const createdBids = await Bid.create(bidsToCreate, {
        session,
        ordered: true,
      });
      // Lấy ID của bid thắng (là bid cuối cùng trong mảng do ta push sau)
      const lastBid = createdBids[createdBids.length - 1];
      if (lastBid.bidderId.toString() === highestBidder.bidderId.toString()) {
        winnerBidId = lastBid._id;
      }
    }

    // 4. Update Auction Data
    // Nếu không có gì thay đổi về giá/người thắng và không có bid mới, có thể skip update?
    // Nhưng bidCount cần tăng.
    // Nếu có bidsToCreate -> có bid mới -> tăng bidCount.

    let updateData = {};
    let shouldUpdate = false;

    if (auction.currentPrice !== newPrice) {
      updateData.currentPrice = newPrice;
      shouldUpdate = true;
    }
    if (
      auction.currentHighestBidderId?.toString() !==
      highestBidder.bidderId.toString()
    ) {
      updateData.currentHighestBidderId = highestBidder.bidderId;
      shouldUpdate = true;
    }
    if (winnerBidId) {
      updateData.currentHighestBidId = winnerBidId;
      shouldUpdate = true;
    }

    if (bidsToCreate.length > 0 || isWinnerChanged || auction.currentPrice !== newPrice) {
      // Calculate active bid count correctly (Bid.create already happened if bidsToCreate.length > 0)
      updateData.bidCount = await Bid.countDocuments({
        auctionId,
        isValid: true,
      }).session(session);
      updateData.updatedAt = new Date();
      shouldUpdate = true;
    }

    // 4.1 Auto Extend Logic
    const settings = await SystemSetting.getAllSettings();
    const autoExtendEnabled = settings.autoExtendEnabled ?? true;
    let autoExtended = false;
    let newEndTime = auction.endAt;

    if (autoExtendEnabled && auction.autoExtendEnabled !== false && bidsToCreate.length > 0) {
      const thresholdMinutes = settings.autoExtendThreshold ?? 5;
      const extendMinutes = settings.autoExtendDuration ?? 10;
      const maxAutoExtend = settings.maxAutoExtendCount ?? 3;
      const currentExtendCount = auction.autoExtendCount || 0;

      const timeLeft = new Date(auction.endAt).getTime() - now.getTime();

      if (
        currentExtendCount < maxAutoExtend &&
        timeLeft > 0 &&
        timeLeft <= thresholdMinutes * 60 * 1000
      ) {
        newEndTime = new Date(
          new Date(auction.endAt).getTime() + extendMinutes * 60 * 1000
        );
        autoExtended = true;

        updateData.endAt = newEndTime;
        if (!updateData.$inc) updateData.$inc = {};
        updateData.$inc.autoExtendCount = 1;

        if (!updateData.$push) updateData.$push = {};
        updateData.$push.autoExtendHistory = {
          extendedAt: new Date(),
          oldEndTime: auction.endAt,
          newEndTime: newEndTime,
          triggeredByBidId: winnerBidId, // Gắn với bid chiến thắng
        };
        shouldUpdate = true;
      }
    }

    // Perform Update
    let updatedAuction = auction;
    if (shouldUpdate) {
      updatedAuction = await Auction.findByIdAndUpdate(auctionId, updateData, {
        new: true,
        session,
      });
    }

    console.log(
      `[BID SERVICE] Auction Resolved. Winner: ${highestBidder.bidderId}, Price: ${newPrice}, BidsCreated: ${bidsToCreate.length}`
    );

    return {
      success: true,
      currentPrice: updatedAuction.currentPrice,
      currentHighestBidderId: updatedAuction.currentHighestBidderId,
      bidCount: updatedAuction.bidCount,
      endAt: updatedAuction.endAt,
    };
  }

  /**
   * Từ chối lượt ra giá của một bidder cho sản phẩm
   * Nếu bidder hiện là highest bidder, cần recalculate lại từ AutoBid
   */
  async rejectBidder(productId, bidderId, sellerId, reason = "") {
    const session = await Auction.startSession();
    session.startTransaction();

    try {
      // 1. Lấy thông tin auction
      const auction = await Auction.findOne({ productId }).session(session);
      if (!auction) throw new AppError("Không tìm thấy cuộc đấu giá", 404);

      // 2. Chặn bidder (Lưu vào danh sách đen)
      // Sử dụng explicit create thay vì upsert để kiểm soát field tốt hơn
      const existingRejection = await RejectedBidder.findOne({
        productId,
        bidderId
      }).session(session);

      if (existingRejection) {
        throw new AppError('Bidder này đã bị từ chối trước đó', 400, 'BIDDER_ALREADY_REJECTED');
      }

      console.log(`[BID SERVICE] Creating rejection with: productId=${productId}, bidderId=${bidderId}`);

      const rejection = new RejectedBidder({
        productId: new mongoose.Types.ObjectId(productId),
        bidderId: new mongoose.Types.ObjectId(bidderId),
        rejectedBy: new mongoose.Types.ObjectId(sellerId),
        reason,
        createdAt: new Date(),
        product: new mongoose.Types.ObjectId(productId), // Explicit cast
        bidder: new mongoose.Types.ObjectId(bidderId)    // Explicit cast
      });

      console.log('[BID SERVICE] Rejection object before save:', rejection);
      await rejection.save({ session });

      // 3. Vô hiệu hóa AutoBid
      await AutoBid.updateMany(
        { auctionId: auction._id, bidderId },
        { active: false },
        { session }
      );

      // 4. Vô hiệu hóa các Bid cũ trong lịch sử
      await Bid.updateMany(
        { auctionId: auction._id, bidderId, isValid: true },
        {
          isValid: false,
          invalidatedAt: new Date(),
          invalidatedReason: `Seller rejected: ${reason}`,
        },
        { session }
      );

      // 5. Quan trọng: Tính toán lại người thắng cuộc bằng logic cốt lõi
      const result = await this._resolveAuction(auction, session);

      await session.commitTransaction();

      // 6. Gửi email thông báo (Chạy ngầm - không await)
      (async () => {
        try {
          const [rejectedUser, product, seller] = await Promise.all([
            User.findById(bidderId),
            Product.findById(productId),
            User.findById(sellerId),
          ]);

          if (rejectedUser && rejectedUser.email) {
            const rejectedDate = new Date().toLocaleString('vi-VN', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', hour12: false
            });

            await sendBidRejectedNotification({
              bidderEmail: rejectedUser.email,
              bidderName: rejectedUser.fullName || rejectedUser.username,
              productTitle: product?.title || 'Sản phẩm',
              sellerName: seller?.fullName || seller?.username || 'Người bán',
              reason: reason,
              rejectedDate: rejectedDate,
              homeUrl: process.env.FRONTEND_URL || 'http://localhost:5173'
            });
            console.log(`[BID SERVICE] Sent rejection email in background to ${rejectedUser.email}`);
          }
        } catch (emailError) {
          console.error(`[BID SERVICE] Background Notification Error:`, emailError);
        }
      })();

      return result;
    } catch (error) {
      await session.abortTransaction();
      console.error("[BID SERVICE] Reject Error:", error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Lấy lịch sử đặt giá của một cuộc đấu giá
   * @param {string} auctionId - ID cuộc đấu giá
   * @param {number} page - Trang (mặc định 1)
   * @param {number} limit - Số record mỗi trang (mặc định 20)
   * @returns {Object} { bids, total, page, pages }
   */
  async getBidHistory(auctionId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [bids, total] = await Promise.all([
      Bid.find({ auctionId, isValid: true })
        .populate("bidderId", "username")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Bid.countDocuments({ auctionId, isValid: true }),
    ]);

    return {
      bids,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * Lấy tổng số bids của một bidder trong một cuộc đấu giá
   * @param {string} auctionId - ID cuộc đấu giá
   * @param {string} bidderId - ID bidder
   * @returns {number} Số bids
   */
  async getBidCountByBidder(auctionId, bidderId) {
    return await Bid.countDocuments({ auctionId, bidderId, isValid: true });
  }


}

export const bidService = new BidService();
