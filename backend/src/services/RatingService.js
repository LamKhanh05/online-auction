// SERVICE: Rating Service

import { Rating, User, Order } from "../models/index.js";
import { AppError } from "../utils/errors.js";
import { RATING_SCORE, RATING_CONTEXT } from "../lib/constants.js";
import mongoose from "mongoose";

export class RatingService {
  /**
   * Tạo đánh giá cho người khác
   * @param {string} raterId - ID người đánh giá
   * @param {string} rateeId - ID người bị đánh giá
   * @param {Object} ratingData - { score, comment, orderId, context }
   * @returns {Object} Bản ghi đánh giá mới
   */
  /**
   * Resolve user ID from ID or Username
   * @private
   */
  async _resolveUserId(idOrUsername) {
    // If it's already an ObjectId, return it
    // Note: We need to import mongoose dynamically or use the imported User model's base
    const mongoose = (await import("mongoose")).default;
    
    if (mongoose.Types.ObjectId.isValid(idOrUsername)) {
        return idOrUsername;
    }

    const user = await User.findOne({ username: idOrUsername }).select("_id");
    if (!user) {
         throw new AppError(
            "Người dùng không tồn tại",
            404,
            "USER_NOT_FOUND"
          );
    }
    return user._id;
  }

  /**
   * Tạo đánh giá cho người khác
   * @param {string} raterId - ID người đánh giá
   * @param {string} rateeId - ID người bị đánh giá (hoặc username)
   * @param {Object} ratingData - { score, comment, orderId, context }
   * @returns {Object} Bản ghi đánh giá mới
   */
  async createRating(raterId, rateeId, ratingData) {
    const { score, comment = "", orderId, context } = ratingData;
    
    const resolvedRateeId = await this._resolveUserId(rateeId);

    // 1. Validate score
    if (![RATING_SCORE.POSITIVE, RATING_SCORE.NEGATIVE].includes(score)) {
      throw new AppError("Điểm đánh giá không hợp lệ", 400);
    }

    // 2. Kiểm tra xem rating đã tồn tại chưa (không cho phép đánh giá lại cho cùng order)
    if (orderId) {
      const existingRating = await Rating.findOne({
        raterId,
        orderId,
        context,
      });
      if (existingRating) {
        throw new AppError("Bạn đã đánh giá cho đơn hàng này rồi", 400);
      }
    }

    // 3. Tạo rating mới
    const rating = new Rating({
      raterId,
      rateeId: resolvedRateeId,
      score,
      comment,
      orderId: orderId || null,
      context: context || "danh_gia_giao_dich",
    });

    await rating.save();

    // 4. Cập nhật ratingSummary của person bị đánh giá
    await this._updateUserRatingSummary(resolvedRateeId);

    return rating;
  }

  /**
   * Cập nhật thông tin thống kê đánh giá của user
   * @private
   * @param {string} userId - ID người dùng
   */
  async _updateUserRatingSummary(userId) {
    console.log(`[RatingService] Updating summary for user: ${userId}`);
    const stats = await Rating.aggregate([
      { 
        $match: { 
          rateeId: new mongoose.Types.ObjectId(userId),
          context: { $in: ['nguoi_mua_danh_gia', 'nguoi_ban_danh_gia', 'danh_gia_giao_dich'] }
        } 
      },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          countPositive: {
            $sum: { $cond: [{ $eq: ["$score", RATING_SCORE.POSITIVE] }, 1, 0] },
          },
          countNegative: {
            $sum: { $cond: [{ $eq: ["$score", RATING_SCORE.NEGATIVE] }, 1, 0] },
          },
        },
      },
    ]);

    const summary =
      stats.length > 0
        ? {
            countPositive: stats[0].countPositive,
            countNegative: stats[0].countNegative,
            totalCount: stats[0].totalCount,
            score:
              stats[0].totalCount > 0
                ? stats[0].countPositive / stats[0].totalCount
                : 0,
          }
        : {
            countPositive: 0,
            countNegative: 0,
            totalCount: 0,
            score: 0,
          };

    await User.findByIdAndUpdate(userId, { ratingSummary: summary });
    console.log(`[RatingService] Updated summary for ${userId}:`, summary);
  }

  // ... (updateRating logic remains mostly same but uses ID usually)

  /**
   * Lấy tất cả đánh giá của một user
   * @param {string} userId - ID user hoặc username
   * @param {number} page - Trang (mặc định 1)
   * @param {number} limit - Số record mỗi trang (mặc định 10)
   * @param {string} type - 'received' | 'given' (mặc định 'received')
   * @returns {Object} { ratings, total, page, pages }
   */
  async getUserRatings(userId, page = 1, limit = 10, type = "received", filter = null) {
    const resolvedUserId = await this._resolveUserId(userId);
    const skip = (page - 1) * limit;

    const query = type === "given" ? { raterId: resolvedUserId } : { rateeId: resolvedUserId };
    
    if (filter) {
      query.context = filter;
    } else {
      // Default: Show all types of transactions
      query.context = { $in: ['nguoi_mua_danh_gia', 'nguoi_ban_danh_gia', 'danh_gia_giao_dich'] };
    }
    
    const populateField = type === "given" ? "rateeId" : "raterId";

    const [ratings, total] = await Promise.all([
      Rating.find(query)
        .populate(populateField, "username profileImageUrl fullName")
        .populate({
          path: "orderId",
          select: "productId",
          populate: { path: "productId", select: "title slug primaryImageUrl" },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Rating.countDocuments(query),
    ]);

    return {
      ratings,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }
 
  // ... (deleteRating logic remains same)

  /**
   * Lấy thống kê đánh giá cho một user
   * @param {string} userId - ID user hoặc username
   * @returns {Object} { countPositive, countNegative, totalCount, score }
   */
  async getUserRatingStats(userId) {
    const resolvedUserId = await this._resolveUserId(userId);
    const user = await User.findById(resolvedUserId).select(
      "ratingSummary username fullName profileImageUrl"
    );

    if (!user) {
       return {
          ratingSummary: {
            countPositive: 0,
            countNegative: 0,
            totalCount: 0,
            score: 0,
          },
          username: "Unknown",
          fullName: "Unknown User",
          profileImageUrl: null
       };
    }

    return {
      ratingSummary: user.ratingSummary || {
        countPositive: 0,
        countNegative: 0,
        totalCount: 0,
        score: 0,
      },
      username: user.username,
      fullName: user.fullName,
      profileImageUrl: user.profileImageUrl,
      _id: user._id
    };
  }
}

export const ratingService = new RatingService();
