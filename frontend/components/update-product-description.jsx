import { useState } from "react";
import DOMPurify from "dompurify";
import { X, Tag, Package, PlusCircle } from "lucide-react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import * as productService from "../app/services/productService";

/**
 * UpdateProductDescription Component
 * Allows seller to APPEND additional information to existing product description
 * API 3.2: PUT /api/products/:productId/description
 *
 * Requirements:
 * - New information must be APPENDED to old description, not replace it
 * - Each update should be timestamped
 * - Cannot replace old description
 */
export default function UpdateProductDescription({
  productId,
  currentDescription,
  currentMetadata = {},
  onUpdate,
  onCancel,
  defaultEditing = false,
}) {
  const [isEditing, setIsEditing] = useState(defaultEditing);
  const [additionalInfo, setAdditionalInfo] = useState(""); // Changed: only for new info
  const [metadata, setMetadata] = useState({
    condition: currentMetadata.condition || "",
    warranty: currentMetadata.warranty || "",
    tags: currentMetadata.tags?.join(", ") || "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate additional information
    const plainText = additionalInfo.replace(/<[^>]*>/g, "").trim();
    if (plainText.length < 10) {
      setError("Thông tin bổ sung phải có ít nhất 10 ký tự");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Prepare metadata
      const metadataToSend = {
        ...currentMetadata,
        condition: metadata.condition,
        warranty: metadata.warranty,
        tags: metadata.tags
          ? metadata.tags.split(",").map((t) => t.trim())
          : [],
      };

      // Create timestamped update
      const timestamp = new Date().toLocaleString("vi-VN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      // Append new information with timestamp to existing description
      const updatedDescription = `${currentDescription}<hr style="border-color: rgba(255,255,255,0.1); margin: 20px 0;"/><div style="margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-left: 4px solid #10b981; border-radius: 12px;"><p style="font-size: 12px; color: #9ca3af; margin-bottom: 8px;"> <strong style="color: #d1d5db;">Cập nhật:</strong> ${timestamp}</p><div style="color: #d1d5db;">${additionalInfo}</div></div>`;

      const result = await productService.updateProductDescription(productId, {
        description: updatedDescription,
        metadata: metadataToSend,
      });

      if (result.success) {
        setSuccess("Đã bổ sung thông tin thành công!");
        setTimeout(() => {
          setIsEditing(false);
          setSuccess("");
          setAdditionalInfo(""); // Clear the additional info
          if (onUpdate) {
            onUpdate(result.data.product);
          }
        }, 1500);
      } else {
        setError(result.message || "Không thể bổ sung thông tin");
      }
    } catch (err) {
      console.error("Error updating description:", err);
      setError(
        err.response?.data?.message || "Đã xảy ra lỗi khi bổ sung thông tin"
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isEditing) {
    return (
      <div className="glass-card bg-white/[0.03] rounded-2xl border border-white/10 p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">Mô tả sản phẩm</h3>
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:shadow-lg hover:shadow-green-500/25 transition font-medium"
          >
            <PlusCircle className="w-4 h-4" />
            Bổ sung thông tin
          </button>
        </div>
        <div
          className="prose prose-invert max-w-none text-gray-300 [&>*]:text-gray-300 [&_h1]:text-white [&_h2]:text-white [&_h3]:text-white [&_strong]:text-white [&_a]:text-blue-400 [&_p]:text-gray-300 [&_div]:text-gray-300 [&_span]:text-gray-300 [&_li]:text-gray-300 [&_ul]:text-gray-300 [&_ol]:text-gray-300"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(currentDescription || "") }}
        />
      </div>
    );
  }

  return (
    <div className="glass-card bg-white/[0.03] rounded-2xl border border-white/10 p-6">
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
        <div>
          <h3 className="text-xl font-bold text-white mb-1">
            Bổ sung thông tin mô tả sản phẩm
          </h3>
          <p className="text-sm text-gray-400">
            Thêm thông tin mới vào mô tả hiện tại
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 animate-pulse">
            <p className="text-red-400 text-sm font-medium">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-500/10 border border-green-500/50 rounded-xl p-4">
            <p className="text-green-400 text-sm font-medium">{success}</p>
          </div>
        )}

        {/* Current Description (Read-only) */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
            📄 Mô tả hiện tại{" "}
            <span className="text-xs font-normal text-gray-500">
              (không thể thay đổi)
            </span>
          </label>
          <div
            className="p-4 bg-white/5 rounded-xl border border-white/10 prose prose-invert max-w-none max-h-60 overflow-y-auto text-gray-300 [&>*]:text-gray-300 [&_h1]:text-white [&_h2]:text-white [&_h3]:text-white [&_strong]:text-white [&_a]:text-blue-400 [&_p]:text-gray-300 [&_div]:text-gray-300 [&_span]:text-gray-300 [&_li]:text-gray-300 [&_ul]:text-gray-300 [&_ol]:text-gray-300 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(currentDescription || "") }}
          />
          <p className="text-xs text-blue-400 mt-2 flex items-center gap-1">
            <span className="text-blue-500"></span> Thông tin mới sẽ được{" "}
            <strong>thêm vào</strong>  phía dưới mô tả hiện tại.
          </p>
        </div>

        {/* Additional Information Editor */}
        <div className="space-y-2">
          <label className="block text-sm font-bold text-gray-300 mb-2">
            Thông tin bổ sung <span className="text-red-400">*</span>
          </label>
          <div className="rounded-xl overflow-hidden border-2 border-primary/30">
            <ReactQuill
              value={additionalInfo}
              onChange={setAdditionalInfo}
              modules={{
                toolbar: [
                  [{ header: [1, 2, 3, false] }],
                  ["bold", "italic", "underline", "strike"],
                  [{ list: "ordered" }, { list: "bullet" }],
                  ["link"],
                  ["clean"],
                ],
              }}
              className="quill-dark-theme"
              placeholder="Nhập thông tin bổ sung cho sản phẩm (sẽ được gắn timestamp tự động)..."
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Tối thiểu 10 ký tự. Hiện tại:{" "}
            <span className="text-primary font-semibold">
              {additionalInfo.replace(/<[^>]*>/g, "").length}
            </span>{" "}
            ký tự
          </p>
        </div>

        {/* Metadata Section */}
        <div className="border-t border-white/10 pt-6">
          <h4 className="text-sm font-bold text-gray-300 mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            Thông tin bổ sung
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Condition */}
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Tình trạng
              </label>
              <select
                value={metadata.condition}
                onChange={(e) =>
                  setMetadata({ ...metadata, condition: e.target.value })
                }
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-primary/50 focus:border-primary transition outline-none"
              >
                <option value="" className="bg-slate-800">
                  Chọn tình trạng
                </option>
                <option value="new" className="bg-slate-800">
                  Mới 100%
                </option>
                <option value="like-new" className="bg-slate-800">
                  Như mới
                </option>
                <option value="used-good" className="bg-slate-800">
                  Đã sử dụng - Tốt
                </option>
                <option value="used-fair" className="bg-slate-800">
                  Đã sử dụng - Khá
                </option>
              </select>
            </div>

            {/* Warranty */}
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Bảo hành
              </label>
              <input
                type="text"
                value={metadata.warranty}
                onChange={(e) =>
                  setMetadata({ ...metadata, warranty: e.target.value })
                }
                placeholder="Ví dụ: 12 tháng"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary/50 focus:border-primary transition outline-none"
              />
            </div>
          </div>

          {/* Tags */}
          <div className="mt-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2">
              <Tag className="w-4 h-4 text-primary" />
              Tags (phân cách bằng dấu phẩy)
            </label>
            <input
              type="text"
              value={metadata.tags}
              onChange={(e) =>
                setMetadata({ ...metadata, tags: e.target.value })
              }
              placeholder="Ví dụ: iphone, apple, flagship, 2024"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary/50 focus:border-primary transition outline-none"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-6 border-t border-white/10">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:shadow-lg hover:shadow-green-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition font-bold"
          >
            {loading ? "Đang bổ sung..." : "Bổ sung thông tin"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (onCancel) {
                onCancel();
              } else {
                setIsEditing(false);
                setAdditionalInfo("");
                setError("");
                setSuccess("");
              }
            }}
            className="px-6 py-3 bg-white/5 text-gray-300 rounded-xl hover:bg-white/10 transition font-medium border border-white/10"
          >
            Hủy
          </button>
        </div>
      </form>
    </div>
  );
}
