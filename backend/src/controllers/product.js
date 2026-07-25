/**
 * ============================================
 * PRODUCT CONTROLLER - Xử lý HTTP requests
 * API 1.1, 1.2, 1.3, 1.4, 1.5
 * ============================================
 */

import { productService } from "../services/ProductService.js";
import { AppError } from "../utils/errors.js";
import { isValidObjectId } from "../utils/validators.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import Auction from "../models/Auction.js";
import Bid from "../models/Bid.js";
import AutoBid from "../models/AutoBid.js";
import Watchlist from "../models/Watchlist.js";
import Question from "../models/Question.js";
import RejectedBidder from "../models/RejectedBidder.js";
import User from "../models/User.js";
import {
  PRODUCT_VALIDATION,
  AUCTION_VALIDATION,
  SORT_OPTIONS,
  PAGINATION,
  PLACEHOLDER_IMAGES,
  AUCTION_STATUS,
} from "../lib/constants.js";

/**
 * API 1.1: Lấy tất cả sản phẩm (phân trang, không lọc)
 * Hiển thị danh sách sản phẩm đang hoạt động với các tùy chọn sắp xếp:
 * - newest (mới nhất)
 * - price_asc (giá thấp đến cao)
 * - price_desc (giá cao đến thấp)
 * - ending_soon (gần kết thúc)
 * - most_bids (nhiều bids nhất)
 *
 * Query params:
 * - page: số trang (mặc định 1)
 * - limit: số sản phẩm trên trang (mặc định 12)
 * - sortBy: cách sắp xếp (mặc định 'newest')
 * - status: trạng thái auction (mặc định 'active')
 *
 * GET /api/products?page=1&limit=12&sortBy=newest&status=active
 */
export const getAllProducts = async (req, res, next) => {
  try {
    const {
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT,
      sortBy = "newest",
      status = AUCTION_STATUS.ACTIVE,
      minPrice,
      maxPrice,
      categoryId,
      search,
      q
    } = req.query;

    // Validate sort options
    if (!SORT_OPTIONS.PRODUCTS.includes(sortBy)) {
      throw new AppError(
        `Tùy chọn sắp xếp không hợp lệ. Chọn: ${SORT_OPTIONS.PRODUCTS.join(
          ", "
        )}`,
        400,
        "INVALID_SORT_OPTION"
      );
    }

    // Validate status options
    const validStatusOptions = [...Object.values(AUCTION_STATUS), 'all'];
    if (status && !validStatusOptions.includes(status)) {
      throw new AppError(
        `Trạng thái không hợp lệ. Chọn: ${validStatusOptions.join(", ")}`,
        400,
        "INVALID_STATUS"
      );
    }

    const filters = {
      minPrice,
      maxPrice,
      categoryId,
      search: search || q // Support both 'search' and 'q' params
    };

    const result = await productService.getAllProducts(
      parseInt(page),
      parseInt(limit),
      sortBy,
      status,
      filters
    );

    res.status(200).json({
      status: "success",
      message: "Lấy danh sách sản phẩm thành công",
      data: result.products,
      pagination: result.pagination,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("[PRODUCT CONTROLLER] Lỗi trong getAllProducts:", error);
    next(error);
  }
};

/**
 * API: Seller xóa sản phẩm của mình (gửi email cho bidders)
 * DELETE /api/products/:productId/seller
 * Seller có thể xóa sản phẩm của mình và gửi thông báo cho tất cả bidders
 */
export const sellerDeleteProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const userId = req.user._id;

    // Validate productId
    if (!isValidObjectId(productId)) {
      throw new AppError("ID sản phẩm không hợp lệ", 400, "INVALID_PRODUCT_ID");
    }

    // Find product
    const product = await Product.findById(productId);
    if (!product) {
      throw new AppError("Không tìm thấy sản phẩm", 404, "PRODUCT_NOT_FOUND");
    }

    // Check if user is the seller
    if (product.sellerId.toString() !== userId.toString()) {
      throw new AppError("Bạn không có quyền xóa sản phẩm này", 403, "FORBIDDEN");
    }

    // Find associated auction
    const auction = await Auction.findOne({ productId: productId });

    // Get all bidders who participated
    let bidders = [];
    if (auction) {
      const uniqueBidderIds = await Bid.distinct('bidderId', { auctionId: auction._id });
      if (uniqueBidderIds.length > 0) {
        bidders = await User.find({ _id: { $in: uniqueBidderIds } })
          .select('email username fullName')
          .lean();
      }
    }

    // Delete all related data
    const deletePromises = [];

    if (auction) {
      deletePromises.push(Auction.findByIdAndDelete(auction._id));
      deletePromises.push(AutoBid.deleteMany({ auctionId: auction._id }));
      deletePromises.push(Bid.deleteMany({ auctionId: auction._id }));
    }

    deletePromises.push(Watchlist.deleteMany({ productId: productId }));
    deletePromises.push(Question.deleteMany({ productId: productId }));
    deletePromises.push(Product.findByIdAndDelete(productId));

    await Promise.all(deletePromises);

    // Send email notifications to all bidders
    if (bidders.length > 0) {
      const { sendEmail } = await import('../utils/email.js');
      const emailPromises = bidders.map(bidder =>
        sendEmail({
          to: bidder.email,
          subject: `Thông báo: Sản phẩm "${product.title}" đã bị xóa`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #dc2626;">Sản phẩm đã bị người bán xóa</h2>
              <p>Xin chào <strong>${bidder.fullName || bidder.username}</strong>,</p>
              <p>Chúng tôi rất tiếc phải thông báo rằng sản phẩm <strong>"${product.title}"</strong> mà bạn đã tham gia đặt giá đã bị người bán xóa khỏi hệ thống.</p>
              <div style="background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #991b1b;"><strong>Thông tin sản phẩm:</strong></p>
                <p style="margin: 5px 0;">Tên sản phẩm: ${product.title}</p>
                <p style="margin: 5px 0;">Giá khởi điểm: ${product.startPrice?.toLocaleString('vi-VN')} VND</p>
              </div>
              <p>Cuộc đấu giá đã bị hủy và tất cả các lượt đặt giá đã được xóa khỏi hệ thống.</p>
              <p>Chúng tôi xin lỗi vì sự bất tiện này và mong bạn tiếp tục tham gia các cuộc đấu giá khác trên nền tảng của chúng tôi.</p>
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                <p style="color: #6b7280; font-size: 12px;">Trân trọng,<br/>Đội ngũ Auction Platform</p>
              </div>
            </div>
          `
        }).catch(err => {
          console.error(`Lỗi khi gửi email cho ${bidder.email}:`, err);
        })
      );

      await Promise.all(emailPromises);
    }

    // Giảm productCount cho category
    if (product.categoryId) {
      const category = await Category.findById(product.categoryId);
      if (category) {
        // Giảm productCount cho category được chọn
        await Category.findByIdAndUpdate(
          product.categoryId,
          { $inc: { productCount: -1 } },
          { new: true }
        );

        // Nếu là subcategory, cũng giảm productCount cho parent
        if (category.level === 2 && category.parentId) {
          await Category.findByIdAndUpdate(
            category.parentId,
            { $inc: { productCount: -1 } },
            { new: true }
          );
        }
      }
    }

    res.status(200).json({
      status: "success",
      message: `Xóa sản phẩm thành công. Đã gửi thông báo cho ${bidders.length} người đặt giá.`,
      data: {
        productId,
        notifiedBidders: bidders.length
      },
    });
  } catch (error) {
    console.error("[PRODUCT CONTROLLER] Lỗi trong sellerDeleteProduct:", error);
    next(error);
  }
};

/**
 * API: Xóa sản phẩm
 * DELETE /api/products/:productId
 * - Seller (owner): Có thể xóa bất kể trạng thái, gửi email thông báo cho bidders
 * - Admin: Chỉ xóa được khi auction không active và không có bids
 */
export const deleteProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const userId = req.user._id;

    // Validate productId
    if (!isValidObjectId(productId)) {
      throw new AppError("ID sản phẩm không hợp lệ", 400, "INVALID_PRODUCT_ID");
    }

    // Find product
    const product = await Product.findById(productId);
    if (!product) {
      throw new AppError("Không tìm thấy sản phẩm", 404, "PRODUCT_NOT_FOUND");
    }

    // Check permissions: seller (owner) or admin
    const isSeller = product.sellerId && product.sellerId.toString() === userId.toString();
    const isAdmin = ["admin", "superadmin"].some((role) => req.user.roles.includes(role));

    if (!isSeller && !isAdmin) {
      throw new AppError("Bạn không có quyền xóa sản phẩm này", 403, "FORBIDDEN");
    }

    // Find associated auction
    const auction = await Auction.findOne({ productId: productId });

    // Admin restrictions: cannot delete if auction is active (regardless of bid count)
    // if (isAdmin && !isSeller && auction) {
    //   if (auction.status === "active" || auction.status === "pending") {
    //     throw new AppError(
    //       "Admin không thể xóa sản phẩm đang có phiên đấu giá hoạt động. Chỉ người bán mới có quyền xóa sản phẩm của mình.",
    //       403,
    //       "ADMIN_CANNOT_DELETE_ACTIVE_PRODUCT"
    //     );
    //   }
    // }

    // Get all bidders and send notifications (for seller deletion)
    let notifiedBidders = [];
    if (isSeller && auction) {
      const bids = await Bid.find({
        auctionId: auction._id
      })
        .populate('bidderId', 'email name')
        .select('bidderId');

      // Get unique bidders
      const uniqueBidderIds = [...new Set(bids.map(b => b.bidderId?._id?.toString()).filter(Boolean))];
      const uniqueBidders = bids
        .filter((bid) =>
          bid.bidderId && uniqueBidderIds.includes(bid.bidderId._id.toString())
        )
        .reduce((acc, bid) => {
          if (!acc.find(b => b._id.toString() === bid.bidderId._id.toString())) {
            acc.push(bid.bidderId);
          }
          return acc;
        }, []);

      notifiedBidders = uniqueBidders;

      // Send email notifications to bidders
      if (notifiedBidders.length > 0) {
        const { sendEmail } = await import('../utils/email.js');

        for (const bidder of notifiedBidders) {
          await sendEmail({
            to: bidder.email,
            subject: `Sản phẩm "${product.title}" đã bị xóa`,
            html: `
              <h2>Thông báo xóa sản phẩm</h2>
              <p>Xin chào ${bidder.name},</p>
              <p>Sản phẩm <strong>${product.title}</strong> mà bạn đã đặt giá đã bị người bán xóa.</p>
              <p>Nếu có bất kỳ thắc mắc nào, vui lòng liên hệ với chúng tôi.</p>
              <p>Trân trọng,<br/>Đội ngũ hỗ trợ</p>
            `
          });
        }
      }
    }

    // Delete all related data
    const deletePromises = [];

    // Delete auction if exists
    if (auction) {
      deletePromises.push(Auction.findByIdAndDelete(auction._id));
      deletePromises.push(AutoBid.deleteMany({ auctionId: auction._id }));
      deletePromises.push(Bid.deleteMany({ auctionId: auction._id }));
    }

    // Delete all watchlist entries for this product
    deletePromises.push(Watchlist.deleteMany({ productId: productId }));

    // Delete all questions for this product
    deletePromises.push(Question.deleteMany({ productId: productId }));

    // Delete rejected bidders
    deletePromises.push(RejectedBidder.deleteMany({ product: productId }));

    // Delete the product itself
    deletePromises.push(Product.findByIdAndDelete(productId));

    await Promise.all(deletePromises);

    // Giảm productCount cho category
    if (product.categoryId) {
      const category = await Category.findById(product.categoryId);
      if (category) {
        // Giảm productCount cho category được chọn
        await Category.findByIdAndUpdate(
          product.categoryId,
          { $inc: { productCount: -1 } },
          { new: true }
        );

        // Nếu là subcategory, cũng giảm productCount cho parent
        if (category.level === 2 && category.parentId) {
          await Category.findByIdAndUpdate(
            category.parentId,
            { $inc: { productCount: -1 } },
            { new: true }
          );
        }
      }
    }

    res.status(200).json({
      status: "success",
      message: "Xóa sản phẩm thành công",
      data: {
        productId,
        productName: product.title,
        deletedBy: isSeller ? 'seller' : 'admin',
        notifiedBidders: notifiedBidders.length
      },
    });
  } catch (error) {
    console.error("[PRODUCT CONTROLLER] Lỗi trong deleteProduct:", error);
    next(error);
  }
};

/**
 * API 1.2: Lấy Top 5 sản phẩm cho Trang Chủ
 * Trả về 3 nhóm top products:
 * - Gần kết thúc (endingSoon)
 * - Nhiều lượt ra giá nhất (mostBids)
 * - Giá cao nhất (highestPrice)
 *
 * GET /api/products/home/top
 */
export const getTopProducts = async (req, res, next) => {
  try {
    const topProducts = await productService.getTopProducts();

    res.status(200).json({
      status: "success",
      message: "Lấy top products thành công",
      data: topProducts,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("[PRODUCT CONTROLLER] Lỗi trong getTopProducts:", error);
    next(error);
  }
};

/**
 * API 1.3: Lấy danh sách sản phẩm theo danh mục (phân trang)
 * Hỗ trợ sắp xếp theo:
 * - newest (mới nhất)
 * - price_asc (giá thấp đến cao)
 * - price_desc (giá cao đến thấp)
 * - ending_soon (gần kết thúc)
 * - most_bids (nhiều bids nhất)
 *
 * GET /api/products/category/:categoryId?page=1&limit=12&sortBy=newest
 */
export const getProductsByCategory = async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const {
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT,
      sortBy = "newest",
    } = req.query;

    // Validate categoryId
    if (!isValidObjectId(categoryId)) {
      throw new AppError(
        "ID danh mục không hợp lệ",
        400,
        "INVALID_CATEGORY_ID"
      );
    }

    // Validate sort options
    if (!SORT_OPTIONS.PRODUCTS.includes(sortBy)) {
      throw new AppError(
        `Tùy chọn sắp xếp không hợp lệ. Chọn: ${SORT_OPTIONS.PRODUCTS.join(
          ", "
        )}`,
        400,
        "INVALID_SORT_OPTION"
      );
    }

    const result = await productService.getProductsByCategory(
      categoryId,
      parseInt(page),
      parseInt(limit),
      sortBy
    );

    res.status(200).json({
      status: "success",
      message: "Lấy danh sách sản phẩm thành công",
      data: result.data,
      pagination: result.pagination,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error(
      "[PRODUCT CONTROLLER] Lỗi trong getProductsByCategory:",
      error
    );
    next(error);
  }
};

/**
 * API 1.4: Tìm kiếm sản phẩm (Full-text search) - API NẶNG
 * Hỗ trợ:
 * - Tìm kiếm theo tên sản phẩm (full-text search)
 * - Lọc theo danh mục
 * - Lọc theo khoảng giá (minPrice, maxPrice)
 * - Sắp xếp theo: giá tăng/giảm, thời gian kết thúc, số bids
 *
 * Query params:
 * - q: từ khóa tìm kiếm (yêu cầu, ít nhất 2 ký tự)
 * - categoryId: ID danh mục (tùy chọn)
 * - minPrice: giá tối thiểu (tùy chọn)
 * - maxPrice: giá tối đa (tùy chọn)
 * - sortBy: cách sắp xếp (relevance, price_asc, price_desc, ending_soon, most_bids)
 * - page: số trang (mặc định 1)
 * - limit: số sản phẩm trên trang (mặc định 12)
 *
 * GET /api/products/search?q=iPhone&categoryId=xxx&minPrice=1000000&maxPrice=5000000&sortBy=price_desc&page=1&limit=12
 */
export const searchProducts = async (req, res, next) => {
  try {
    const {
      q = "",
      categoryId,
      minPrice,
      maxPrice,
      sortBy = "relevance",
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT,
    } = req.query;

    // Validate search query
    if (!q || q.trim().length < 2) {
      throw new AppError(
        "Vui lòng nhập từ khóa tìm kiếm (ít nhất 2 ký tự)",
        400,
        "INVALID_SEARCH_QUERY"
      );
    }

    // Validate sort options
    if (!SORT_OPTIONS.SEARCH.includes(sortBy)) {
      throw new AppError(
        `Tùy chọn sắp xếp không hợp lệ. Chọn: ${SORT_OPTIONS.SEARCH.join(
          ", "
        )}`,
        400,
        "INVALID_SORT_OPTION"
      );
    }

    // Prepare filters
    const filters = {
      categoryId: categoryId || null,
      minPrice: minPrice ? parseInt(minPrice) : null,
      maxPrice: maxPrice ? parseInt(maxPrice) : null,
      sortBy,
    };

    const result = await productService.searchProducts(
      q,
      filters,
      parseInt(page),
      parseInt(limit)
    );

    res.status(200).json({
      status: "success",
      message: "Tìm kiếm sản phẩm thành công",
      data: result.data,
      pagination: result.pagination,
      query: result.query,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("[PRODUCT CONTROLLER] Lỗi trong searchProducts:", error);
    next(error);
  }
};

/**
 * API 1.5: Lấy chi tiết sản phẩm (đầy đủ)
 * Hiển thị:
 * - Tất cả thông tin sản phẩm (tiêu đề, ảnh, mô tả, metadata)
 * - Thông tin người bán (username, email, rating)
 * - Thông tin phiên đấu giá (giá hiện tại, số bids, thời gian kết thúc)
 * - Top 5 bidders gần đây (masked info)
 * - 5 sản phẩm cùng danh mục (related products)
 *
 * GET /api/products/:productId
 */
export const getProductDetail = async (req, res, next) => {
  try {
    const { productId } = req.params;

    // Validate productId
    if (!isValidObjectId(productId)) {
      throw new AppError("ID sản phẩm không hợp lệ", 400, "INVALID_PRODUCT_ID");
    }

    const incrementView = req.query.incrementView !== 'false';
    const result = await productService.getProductDetail(productId, { incrementView });

    res.status(200).json({
      status: "success",
      message: "Lấy chi tiết sản phẩm thành công",
      data: result,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("[PRODUCT CONTROLLER] Lỗi trong getProductDetail:", error);
    next(error);
  }
};

/**
 * API: Lấy thông tin chi tiết đầy đủ của sản phẩm cho admin
 * GET /api/products/:productId/admin-details
 */
export const getProductAdminDetails = async (req, res, next) => {
  try {
    const { productId } = req.params;

    // Validate productId
    if (!isValidObjectId(productId)) {
      throw new AppError("ID sản phẩm không hợp lệ", 400, "INVALID_PRODUCT_ID");
    }

    const result = await productService.getProductAdminDetails(productId);

    res.status(200).json({
      status: "success",
      message: "Lấy chi tiết sản phẩm (admin) thành công",
      data: result,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("[PRODUCT CONTROLLER] Lỗi trong getProductAdminDetails:", error);
    next(error);
  }
};

/**
 * ============================================
 * API 3.1: Đăng sản phẩm đấu giá
 * ============================================
 */
export const postProduct = async (req, res) => {
  try {
    // 1. Lấy dữ liệu từ request
    const {
      title,
      description,
      categoryId,
      startPrice,
      priceStep,
      buyNowPrice,
      startTime,
      endTime,
      metadata,
    } = req.body;

    // 2. Lấy files đã upload (từ multer middleware)
    const uploadedFiles = req.files;

    // Lấy primaryImage và additional images
    const primaryImageFile = uploadedFiles?.['primaryImage']?.[0];
    const additionalImageFiles = uploadedFiles?.['images'] || [];

    // ========================================
    // 3. VALIDATE CÁC TRƯỜNG TEXT
    // ========================================

    // Validate title
    if (!title || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Tên sản phẩm không được để trống",
      });
    }

    if (title.length > PRODUCT_VALIDATION.TITLE_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Tên sản phẩm không được vượt quá ${PRODUCT_VALIDATION.TITLE_MAX_LENGTH} ký tự`,
      });
    }

    // Validate description
    if (!description || description.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Mô tả sản phẩm không được để trống",
      });
    }

    if (description.length < PRODUCT_VALIDATION.DESCRIPTION_MIN_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Mô tả sản phẩm phải có ít nhất ${PRODUCT_VALIDATION.DESCRIPTION_MIN_LENGTH} ký tự`,
      });
    }

    // Validate categoryId
    if (!categoryId) {
      return res.status(400).json({
        success: false,
        message: "Danh mục sản phẩm là bắt buộc",
      });
    }

    // Kiểm tra category tồn tại
    const categoryExists = await Category.findById(categoryId);
    if (!categoryExists) {
      return res.status(404).json({
        success: false,
        message: "Danh mục không tồn tại",
      });
    }

    // ========================================
    // 4. VALIDATE GIÁ (startPrice & priceStep)
    // ========================================

    // Validate startPrice
    if (!startPrice) {
      return res.status(400).json({
        success: false,
        message: "Giá khởi điểm là bắt buộc",
      });
    }

    const numStartPrice = Number(startPrice);

    if (isNaN(numStartPrice)) {
      return res.status(400).json({
        success: false,
        message: "Giá khởi điểm phải là số hợp lệ",
      });
    }

    if (!Number.isInteger(numStartPrice)) {
      return res.status(400).json({
        success: false,
        message: "Giá khởi điểm phải là số nguyên",
      });
    }

    if (numStartPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "Giá khởi điểm phải lớn hơn 0",
      });
    }

    if (numStartPrice < AUCTION_VALIDATION.MIN_START_PRICE) {
      return res.status(400).json({
        success: false,
        message: `Giá khởi điểm tối thiểu là ${AUCTION_VALIDATION.MIN_START_PRICE.toLocaleString()} VND`,
      });
    }

    // Validate priceStep
    if (!priceStep) {
      return res.status(400).json({
        success: false,
        message: "Bước giá là bắt buộc",
      });
    }

    const numPriceStep = Number(priceStep);

    if (isNaN(numPriceStep)) {
      return res.status(400).json({
        success: false,
        message: "Bước giá phải là số hợp lệ",
      });
    }

    if (!Number.isInteger(numPriceStep)) {
      return res.status(400).json({
        success: false,
        message: "Bước giá phải là số nguyên",
      });
    }

    if (numPriceStep <= 0) {
      return res.status(400).json({
        success: false,
        message: "Bước giá phải lớn hơn 0",
      });
    }

    if (numPriceStep < AUCTION_VALIDATION.MIN_PRICE_STEP) {
      return res.status(400).json({
        success: false,
        message: `Bước giá tối thiểu là ${AUCTION_VALIDATION.MIN_PRICE_STEP.toLocaleString()} VND`,
      });
    }

    // ⭐ Validate priceStep < startPrice
    if (numPriceStep >= numStartPrice) {
      return res.status(400).json({
        success: false,
        message: `Bước giá (${numPriceStep.toLocaleString()} VND) phải nhỏ hơn giá khởi điểm (${numStartPrice.toLocaleString()} VND)`,
      });
    }

    // ========================================
    // Validate buyNowPrice (optional)
    // ========================================
    let numBuyNowPrice = null;

    if (
      buyNowPrice !== undefined &&
      buyNowPrice !== null &&
      buyNowPrice !== "" &&
      buyNowPrice !== "0"
    ) {
      numBuyNowPrice = Number(buyNowPrice);

      if (isNaN(numBuyNowPrice)) {
        return res.status(400).json({
          success: false,
          message: "Giá mua ngay phải là số hợp lệ",
        });
      }

      if (!Number.isInteger(numBuyNowPrice)) {
        return res.status(400).json({
          success: false,
          message: "Giá mua ngay phải là số nguyên",
        });
      }

      if (numBuyNowPrice <= 0) {
        return res.status(400).json({
          success: false,
          message: "Giá mua ngay phải lớn hơn 0",
        });
      }

      // Validate buyNowPrice > startPrice
      if (numBuyNowPrice <= numStartPrice) {
        return res.status(400).json({
          success: false,
          message: `Giá mua ngay (${numBuyNowPrice.toLocaleString()} VND) phải lớn hơn giá khởi điểm (${numStartPrice.toLocaleString()} VND)`,
        });
      }
    }

    // ========================================
    // 5. VALIDATE THỜI GIAN
    // ========================================
    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "Thời gian bắt đầu và kết thúc là bắt buộc",
      });
    }

    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    const now = new Date();

    if (isNaN(startDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Thời gian bắt đầu không hợp lệ",
      });
    }

    if (isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Thời gian kết thúc không hợp lệ",
      });
    }

    if (startDate <= now) {
      return res.status(400).json({
        success: false,
        message: "Thời gian bắt đầu phải sau thời điểm hiện tại",
      });
    }

    if (endDate <= startDate) {
      return res.status(400).json({
        success: false,
        message: "Thời gian kết thúc phải sau thời gian bắt đầu",
      });
    }

    const minDuration = AUCTION_VALIDATION.MIN_DURATION_MS;
    if (endDate - startDate < minDuration) {
      return res.status(400).json({
        success: false,
        message: `Thời gian đấu giá phải ít nhất ${AUCTION_VALIDATION.MIN_DURATION_HOURS} giờ`,
      });
    }

    // ========================================
    // 6. XỬ LÝ ẢNH - Convert thành base64 URL và lưu vào MongoDB
    // ========================================

    let imageUrls;
    let primaryImageUrl;

    // Nếu có middleware upload
    if (primaryImageFile && additionalImageFiles.length > 0) {

      // Convert primary image to base64
      const primaryB64 = Buffer.from(primaryImageFile.buffer).toString('base64');
      primaryImageUrl = "data:" + primaryImageFile.mimetype + ";base64," + primaryB64;

      // Convert additional images to base64 URLs
      imageUrls = additionalImageFiles.map((file) => {
        const b64 = Buffer.from(file.buffer).toString('base64');
        return "data:" + file.mimetype + ";base64," + b64;
      });
    }
    // Nếu không có middleware (test mode)
    else {
      imageUrls = PLACEHOLDER_IMAGES.PRODUCT;
      primaryImageUrl = imageUrls[0];
    }

    // ========================================
    // 7. TẠO SLUG
    // ========================================
    const slug = title
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/(^-|-$)/g, "");

    // ========================================
    // 8. TẠO PRODUCT
    // ========================================

    // Lấy sellerId từ authenticated user
    const sellerId = req.user?._id || req.user?.id;

    if (!sellerId) {
      return res.status(401).json({
        success: false,
        message: "Vui lòng đăng nhập để đăng sản phẩm",
      });
    }

    const newProduct = new Product({
      sellerId,
      categoryId,
      title: title.trim(),
      slug,
      descriptionHistory: [
        {
          text: description.trim(),
          createdAt: new Date(),
          authorId: sellerId,
        },
      ],
      primaryImageUrl,
      imageUrls,
      // Nếu gửi JSON: metadata đã là object
      // Nếu gửi form-data: metadata là string, cần parse
      metadata:
        typeof metadata === "string" ? JSON.parse(metadata) : metadata || {},
      baseCurrency: "VND",
      isActive: true,
      requireBidderApproval: true,
      flags: {
        featured: false,
        highlightedUntil: null,
        isNewUntil: new Date(
          Date.now() + AUCTION_VALIDATION.NEW_PRODUCT_DAYS * 24 * 60 * 60 * 1000
        ),
      },
    });

    const savedProduct = await newProduct.save();

    // ========================================
    // 9. TẠO AUCTION SESSION
    // ========================================

    // Nếu auction bắt đầu trong vòng 1 phút (60 giây), coi như đấu giá ngay
    // và set status = ACTIVE để hiển thị trên trang auction ngay lập tức
    const timeUntilStart = startDate - now;
    const isImmediateAuction = timeUntilStart <= 60000; // 60 seconds

    const auctionData = {
      productId: savedProduct._id,
      sellerId,
      startPrice: numStartPrice,
      priceStep: numPriceStep,
      currentPrice: numStartPrice,
      startAt: startDate,
      endAt: endDate,
      status: isImmediateAuction ? AUCTION_STATUS.ACTIVE : AUCTION_STATUS.SCHEDULED,
      bidCount: 0,
      autoExtendEnabled: true,
    };

    // Thêm buyNowPrice nếu có
    if (numBuyNowPrice) {
      auctionData.buyNowPrice = numBuyNowPrice;
    }

    const newAuction = new Auction(auctionData);

    const savedAuction = await newAuction.save();
    await savedProduct.populate("categoryId", "name slug");

    // ========================================
    // 10. CẬP NHẬT PRODUCT COUNT CHO CATEGORY
    // ========================================
    // Tăng productCount cho category được chọn
    await Category.findByIdAndUpdate(
      categoryId,
      { $inc: { productCount: 1 } },
      { new: true }
    );

    // Nếu category là subcategory (level 2), cũng tăng productCount cho parent category
    if (categoryExists.level === 2 && categoryExists.parentId) {
      await Category.findByIdAndUpdate(
        categoryExists.parentId,
        { $inc: { productCount: 1 } },
        { new: true }
      );
    }

    const isTestMode = !primaryImageFile || additionalImageFiles.length === 0;

    return res.status(201).json({
      success: true,
      message: isTestMode
        ? "✅ TEST MODE: Đăng sản phẩm thành công (fake images)"
        : "Đăng sản phẩm đấu giá thành công",
      data: {
        product: {
          _id: savedProduct._id,
          title: savedProduct.title,
          slug: savedProduct.slug,
          category: savedProduct.categoryId,
          primaryImageUrl: savedProduct.primaryImageUrl,
          imageUrls: savedProduct.imageUrls,
          description: savedProduct.descriptionHistory[0].text,
          metadata: savedProduct.metadata,
          createdAt: savedProduct.createdAt,
        },
        auction: {
          _id: savedAuction._id,
          startPrice: savedAuction.startPrice,
          priceStep: savedAuction.priceStep,
          buyNowPrice: savedAuction.buyNowPrice || null,
          currentPrice: savedAuction.currentPrice,
          startTime: savedAuction.startAt, // ← Map từ startAt
          endTime: savedAuction.endAt, // ← Map từ endAt
          status: savedAuction.status,
          bidCount: savedAuction.bidCount,
        },
      },
    });
  } catch (error) {
    console.error("[PRODUCT CONTROLLER] Error in postProduct:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Dữ liệu không hợp lệ",
        errors: Object.keys(error.errors).map((key) => ({
          field: key,
          message: error.errors[key].message,
        })),
      });
    }

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi đăng sản phẩm",
      error: error.message,
    });
  }
};

/**
 * Toggle auto-extend for seller's auction
 * PUT /api/products/:productId/auto-extend
 */
export const toggleAutoExtend = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { autoExtendEnabled } = req.body;
    const userId = req.user?._id;
    const userRoles = req.user?.roles || [];

    // Validate productId
    if (!isValidObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    // Validate autoExtendEnabled
    if (typeof autoExtendEnabled !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "autoExtendEnabled must be a boolean",
      });
    }

    // Find product and check ownership
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check ownership: seller hoặc admin
    const isAdmin =
      userRoles.includes("admin") || userRoles.includes("superadmin");
    const isSeller = userId && product.seller.toString() === userId.toString();

    if (userId && !isAdmin && !isSeller) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to modify this product",
      });
    }

    // Find auction
    const auction = await Auction.findOne({ product: productId });
    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found for this product",
      });
    }

    // Check if auction is still active
    if (auction.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Can only modify auto-extend for active auctions",
      });
    }

    // Update auction
    auction.autoExtendEnabled = autoExtendEnabled;
    await auction.save();

    res.json({
      success: true,
      message: `Auto-extend ${autoExtendEnabled ? "enabled" : "disabled"
        } successfully`,
      data: {
        productId,
        auctionId: auction._id,
        autoExtendEnabled: auction.autoExtendEnabled,
        autoExtendCount: auction.autoExtendCount || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ============================================
 * API 3.2: Bổ sung thông tin mô tả sản phẩm
 * PUT /api/products/:productId/description
 * ============================================
 * Cho phép seller cập nhật mô tả, metadata của sản phẩm
 * Không cho phép thay đổi giá, thời gian nếu đã có bid
 */
export const updateProductDescription = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { description, metadata } = req.body;
    const userId = req.user?._id;
    const userRoles = req.user?.roles || [];

    // Validate productId
    if (!isValidObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: "ID sản phẩm không hợp lệ",
      });
    }

    // Find product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Sản phẩm không tồn tại",
      });
    }

    // Check ownership: seller hoặc admin
    const isAdmin =
      userRoles.includes("admin") || userRoles.includes("superadmin");
    const isSeller =
      userId && product.sellerId.toString() === userId.toString();

    if (!isAdmin && !isSeller) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền chỉnh sửa sản phẩm này",
      });
    }

    // Find auction
    const auction = await Auction.findOne({ productId });
    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Phiên đấu giá không tồn tại",
      });
    }

    // Check auction status - không cho phép edit khi ended/cancelled
    if (["ended", "cancelled"].includes(auction.status)) {
      return res.status(400).json({
        success: false,
        message:
          "Không thể cập nhật mô tả cho phiên đấu giá đã kết thúc hoặc bị hủy",
      });
    }

    // Validate description nếu có
    if (description !== undefined) {
      if (!description || description.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: "Mô tả sản phẩm không được để trống",
        });
      }

      if (description.length < PRODUCT_VALIDATION.DESCRIPTION_MIN_LENGTH) {
        return res.status(400).json({
          success: false,
          message: `Mô tả sản phẩm phải có ít nhất ${PRODUCT_VALIDATION.DESCRIPTION_MIN_LENGTH} ký tự`,
        });
      }

      // Add new description to history
      product.descriptionHistory.push({
        text: description.trim(),
        createdAt: new Date(),
        authorId: userId,
      });
    }

    // Update metadata nếu có
    if (metadata !== undefined) {
      product.metadata = { ...product.metadata, ...metadata };
    }

    product.updatedAt = new Date();
    await product.save();

    // ----------------------------------------------------
    // NOTIFY BIDDERS ABOUT DESCRIPTION UPDATE
    // ----------------------------------------------------
    try {
      // Get all bidders who participated
      const bids = await Bid.find({ auctionId: auction._id })
        .populate("bidderId", "email username fullName")
        .lean();

      if (bids.length > 0) {
        // Get unique bidders (filter out null/deleted users)
        const uniqueBidders = [];
        const seenIds = new Set();

        for (const bid of bids) {
          if (bid.bidderId && !seenIds.has(bid.bidderId._id.toString())) {
            seenIds.add(bid.bidderId._id.toString());
            uniqueBidders.push(bid.bidderId);
          }
        }

        if (uniqueBidders.length > 0) {
          const { sendProductDescriptionUpdatedNotification } = await import(
            "../utils/email.js"
          );

          // Get seller name
          const seller = await User.findById(userId).select("username fullName");
          const sellerName = seller ? (seller.fullName || seller.username) : "Người bán";

          // Send emails in background
          Promise.all(
            uniqueBidders.map((bidder) =>
              sendProductDescriptionUpdatedNotification({
                bidderEmail: bidder.email,
                bidderName: bidder.fullName || bidder.username,
                sellerName: sellerName,
                productTitle: product.title,
                productUrl: `${process.env.FRONTEND_URL}/product/${product._id}`,
              })
            )
          ).catch((err) =>
            console.error(
              "[PRODUCT CONTROLLER] Background email error (description update):",
              err
            )
          );
        }
      }
    } catch (notifyError) {
      console.error(
        "[PRODUCT CONTROLLER] Error notifying bidders about description update:",
        notifyError
      );
      // Don't convert this to app error, just log it so success response still returns
    }
    // ----------------------------------------------------

    // Populate để trả về đầy đủ
    await product.populate("categoryId", "name slug");

    // Get latest description
    const latestDescription =
      product.descriptionHistory.length > 0
        ? product.descriptionHistory[product.descriptionHistory.length - 1].text
        : "";

    res.json({
      success: true,
      message: "Cập nhật mô tả sản phẩm thành công",
      data: {
        product: {
          _id: product._id,
          title: product.title,
          description: latestDescription,
          descriptionHistory: product.descriptionHistory,
          metadata: product.metadata,
          primaryImageUrl: product.primaryImageUrl,
          category: product.categoryId,
          updatedAt: product.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error(
      "[PRODUCT CONTROLLER] Error in updateProductDescription:",
      error
    );
    next(error);
  }
};

/**
 * ============================================
 * API 3.3: Từ chối lượt ra giá của bidder
 * POST /api/products/:productId/reject-bidder
 * ============================================
 * Seller từ chối một bidder, nếu bidder đang thắng
 * thì chuyển người thắng sang bidder thứ 2
 */
export const rejectBidder = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { bidderId, reason } = req.body;
    const userId = req.user?._id;
    const userRoles = req.user?.roles || [];

    // Validate input
    if (!isValidObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: "ID sản phẩm không hợp lệ",
      });
    }

    if (!isValidObjectId(bidderId)) {
      return res.status(400).json({
        success: false,
        message: "ID bidder không hợp lệ",
      });
    }

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Lý do từ chối là bắt buộc",
      });
    }

    // Check user cannot reject themselves
    if (userId && userId.toString() === bidderId.toString()) {
      return res.status(400).json({
        success: false,
        message: "Bạn không thể từ chối chính mình",
      });
    }

    // Find product and check ownership
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Sản phẩm không tồn tại",
      });
    }

    // Check ownership: seller hoặc admin
    const isAdmin =
      userRoles.includes("admin") || userRoles.includes("superadmin");
    const isSeller =
      userId && product.sellerId.toString() === userId.toString();

    if (!isAdmin && !isSeller) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền từ chối bidder cho sản phẩm này",
      });
    }

    // Call BidService to handle rejection logic
    const { BidService: BidServiceClass } = await import(
      "../services/BidService.js"
    );
    const bidService = new BidServiceClass();

    const result = await bidService.rejectBidder(
      productId,
      bidderId,
      userId.toString(),
      reason
    );

    res.json({
      success: true,
      message: "Từ chối bidder thành công",
      data: {
        rejection: result.rejection,
        bidsRemoved: result.bidsRemoved,
        newHighestBidder: result.newHighestBidder
      },
    });
  } catch (error) {
    console.error("[PRODUCT CONTROLLER] Error in rejectBidder:", error);

    if (error.code === 'BIDDER_ALREADY_REJECTED') {
      return res.status(400).json({
        success: false,
        message: error.message || "Bidder này đã bị từ chối trước đó",
      });
    }

    if (error.message === "Auction not found") {
      return res.status(404).json({
        success: false,
        message: "Phiên đấu giá không tồn tại",
      });
    }

    next(error);
  }
};



/**
 * POST Approve First-Time Bidder
 * POST /api/products/:productId/approve-bidder
 * Auth: Seller (product owner)
 */
/**
 * POST Toggle Bidder Approval Requirement
 * POST /api/products/:productId/toggle-approval
 * Auth: Seller (product owner)
 */
export const toggleBidderApproval = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const userId = req.user._id;

    // Validate
    if (!isValidObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: "ID không hợp lệ"
      });
    }

    // Find product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sản phẩm"
      });
    }

    // Check ownership
    if (product.sellerId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền thay đổi cấu hình sản phẩm này"
      });
    }

    // Toggle the approval requirement
    product.requireBidderApproval = !product.requireBidderApproval;
    await product.save();

    res.status(200).json({
      success: true,
      message: product.requireBidderApproval
        ? "Đã tắt chế độ cho phép người mới (Yêu cầu phê duyệt)"
        : "Đã bật chế độ cho phép người mới tham gia",
      data: {
        productId: product._id,
        requireBidderApproval: product.requireBidderApproval
      }
    });

  } catch (error) {
    console.error('[PRODUCT CONTROLLER] Error in toggleBidderApproval:', error);
    next(error);
  }
};

export const approveFirstTimeBidder = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { bidderId } = req.body;
    const userId = req.user._id;

    // Validate
    if (!isValidObjectId(productId) || !isValidObjectId(bidderId)) {
      return res.status(400).json({
        success: false,
        message: "ID không hợp lệ"
      });
    }

    // Find product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sản phẩm"
      });
    }

    // Check ownership
    if (product.sellerId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền duyệt bidder cho sản phẩm này"
      });
    }

    // Check if bidder exists
    const bidder = await User.findById(bidderId);
    if (!bidder) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy người dùng"
      });
    }

    // Initialize approvedBidders array if not exists
    if (!product.approvedBidders) {
      product.approvedBidders = [];
    }

    // Check if already approved
    if (product.approvedBidders.some(id => id.toString() === bidderId)) {
      return res.status(400).json({
        success: false,
        message: "Người dùng này đã được duyệt trước đó"
      });
    }

    // Add to approved bidders
    product.approvedBidders.push(bidderId);
    await product.save();

    // Send email notification
    const { sendEmail } = await import('../utils/email.js');
    await sendEmail({
      to: bidder.email,
      subject: `Bạn đã được duyệt tham gia đấu giá "${product.name}"`,
      html: `
        <h2>Chúc mừng! Bạn đã được duyệt</h2>
        <p>Xin chào ${bidder.name},</p>
        <p>Bạn đã được người bán duyệt để tham gia đấu giá sản phẩm <strong>${product.name}</strong>.</p>
        <p>Giờ đây bạn có thể đặt giá cho sản phẩm này.</p>
        <p>Chúc bạn may mắn!</p>
        <p>Trân trọng,<br/>Đội ngũ hỗ trợ</p>
      `
    });

    res.status(200).json({
      success: true,
      message: "Đã duyệt bidder thành công",
      data: {
        product: {
          id: product._id,
          name: product.name
        },
        approvedBidder: {
          id: bidder._id,
          name: bidder.name,
          email: bidder.email
        }
      }
    });

  } catch (error) {
    console.error('[PRODUCT CONTROLLER] Error in approveFirstTimeBidder:', error);
    next(error);
  }
};