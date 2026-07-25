import DOMPurify from 'dompurify';
import { formatDateTime } from './utils';

export default function DescriptionTab({ description, descriptionHistory = [] }) {
  // Get current description - either from description prop or latest from history
  const rawDescription = description || 
    (descriptionHistory.length > 0 ? descriptionHistory[descriptionHistory.length - 1]?.text : null);
  const currentDescription = rawDescription ? DOMPurify.sanitize(rawDescription.replace(/\n/g, '<br/>')) : null;

  return (
    <div className="space-y-8">
      {/* Description Section */}
      <div>
        <h4 className="text-lg font-bold mb-4">Mô tả sản phẩm</h4>
        <div className="prose prose-sm max-w-none text-foreground">
          {currentDescription ? (
            <div 
              className="whitespace-pre-wrap leading-relaxed"
              dangerouslySetInnerHTML={{ __html: currentDescription }}
            />
          ) : (
            <p className="text-muted-foreground italic">
              Người bán chưa cung cấp mô tả chi tiết cho sản phẩm này.
            </p>
          )}
        </div>
      </div>

      {/* Description History (if multiple updates) */}
      {descriptionHistory && descriptionHistory.length > 1 && (
        <div className="pt-6 border-t border-border">
          <h4 className="text-lg font-bold mb-4">Lịch sử cập nhật mô tả</h4>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {descriptionHistory.slice().reverse().map((entry, index) => (
              <div key={index} className="text-sm">
                <p className="text-xs text-muted-foreground mb-2">{formatDateTime(entry.createdAt)}</p>
                {/* <div className="prose prose-sm max-w-none text-foreground">
                  <div dangerouslySetInnerHTML={{ __html: entry.text }} />
                </div> */}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
