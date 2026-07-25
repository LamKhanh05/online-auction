// MIDDLEWARE: Input Validation using Zod
import { z } from "zod";
import { AppError } from "../utils/errors.js";
import { ERROR_CODES } from "../lib/constants.js";

// Helper to format Zod error to flat array matching frontend expectation: [{ path, msg }]
const formatZodErrors = (error) => {
  return error.errors.map((e) => ({
    path: e.path.join("."),
    msg: e.message,
  }));
};

const objectIdSchema = z.string().refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
  message: "ID không hợp lệ",
});

// 1. Register Schema
const registerSchema = z.object({
  username: z.string()
    .min(3, "Tên đăng nhập phải từ 3-30 ký tự")
    .max(30, "Tên đăng nhập phải từ 3-30 ký tự")
    .regex(/^[a-zA-Z0-9_]+$/, "Tên đăng nhập chỉ chứa chữ cái, số và dấu gạch dưới"),
  email: z.string().email("Email không hợp lệ"),
  password: z.string()
    .min(8, "Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và số")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, "Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và số"),
  passwordConfirm: z.string(),
  fullName: z.string().trim().nonempty("Vui lòng nhập họ tên"),
  address: z.object({
    city: z.string().trim().nonempty("Vui lòng chọn Tỉnh/Thành phố"),
    district: z.string().trim().nonempty("Vui lòng chọn Quận/Huyện"),
    ward: z.string().trim().nonempty("Vui lòng chọn Phường/Xã"),
    street: z.string().trim().nonempty("Vui lòng nhập số nhà, tên đường"),
  }, { required_error: "Vui lòng nhập đầy đủ địa chỉ" }),
  recaptchaToken: z.string().optional(),
}).refine((data) => data.password === data.passwordConfirm, {
  message: "Mật khẩu xác nhận không khớp",
  path: ["passwordConfirm"],
});

// 2. OTP Schema
const otpSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  otp: z.string().regex(/^\d{6}$/, "Mã OTP phải là 6 chữ số"),
});

// 3. Login Schema
const loginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().nonempty("Vui lòng nhập mật khẩu"),
});

// 4. Product Schema
const productSchema = z.object({
  title: z.string().min(10, "Tiêu đề sản phẩm phải từ 10-200 ký tự").max(200, "Tiêu đề sản phẩm phải từ 10-200 ký tự"),
  categoryId: objectIdSchema,
  priceStep: z.number().positive("Bước giá phải là số dương"),
  startPrice: z.number().positive("Giá khởi điểm phải là số dương"),
  imageUrls: z.array(z.string()).min(3, "Phải có ít nhất 3 hình ảnh"),
  description: z.string().optional(),
  buyNowPrice: z.number().positive("Giá mua ngay phải là số dương").nullable().optional(),
  autoExtendEnabled: z.boolean().optional(),
  requireBidderApproval: z.boolean().optional(),
});

// 5. Auction Schema
const auctionSchema = z.object({
  title: z.string().nonempty("Vui lòng nhập tiêu đề đấu giá"),
  description: z.string().nonempty("Vui lòng nhập mô tả đấu giá"),
  startPrice: z.number().positive("Giá khởi điểm phải là số dương"),
  priceStep: z.number().positive("Bước giá phải là số dương"),
  startAt: z.preprocess((val) => new Date(val), z.date({ invalid_type_error: "Định dạng thời gian bắt đầu không hợp lệ" })),
  endAt: z.preprocess((val) => new Date(val), z.date({ invalid_type_error: "Định dạng thời gian kết thúc không hợp lệ" })),
  buyNowPrice: z.number().positive("Giá mua ngay phải là số dương").nullable().optional(),
}).refine((data) => data.endAt > data.startAt, {
  message: "Thời gian kết thúc phải sau thời gian bắt đầu",
  path: ["endAt"],
});

// 6. Bid Schema
const bidSchema = z.object({
  amount: z.number().positive("Số tiền đặt giá phải là số dương"),
});

// 7. AutoBid Schema
const autoBidSchema = z.object({
  maxAmount: z.number().positive("Mức giá tối đa phải là số dương"),
});

// 8. Question Schema
const questionSchema = z.object({
  text: z.string().trim().nonempty("Nội dung câu hỏi không được để trống").max(500, "Câu hỏi không được vượt quá 500 ký tự"),
});

// 9. Rating Schema
const ratingSchema = z.object({
  score: z.number().refine((val) => [1, -1].includes(val), {
    message: "Điểm đánh giá phải là 1 (tích cực) hoặc -1 (tiêu cực)",
  }),
  comment: z.string().max(500, "Nhận xét không được vượt quá 500 ký tự").optional().default(""),
  orderId: objectIdSchema.optional().nullable(),
  context: z.string().optional(),
});

// Middleware generators
const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const error = new AppError("Dữ liệu nhập vào không hợp lệ", 400, ERROR_CODES.INVALID_INPUT);
    error.errors = formatZodErrors(result.error);
    error.isValidationError = true;
    return next(error);
  }
  req.body = result.data;
  next();
};

// Export middleware functions
export const validateRegisterInput = validateBody(registerSchema);
export const validateOtpInput = validateBody(otpSchema);
export const validateLoginInput = validateBody(loginSchema);
export const validateProductInput = validateBody(productSchema);
export const validateAuctionInput = validateBody(auctionSchema);
export const validateBidInput = validateBody(bidSchema);
export const validateAutoBidInput = validateBody(autoBidSchema);
export const validateQuestionInput = validateBody(questionSchema);
export const validateRatingInput = validateBody(ratingSchema);

export const validateIdParam = (paramName = "id") => {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      const error = new AppError(`${paramName} không hợp lệ`, 400, ERROR_CODES.INVALID_INPUT);
      error.errors = [{ path: paramName, msg: `${paramName} không hợp lệ` }];
      error.isValidationError = true;
      return next(error);
    }
    next();
  };
};
