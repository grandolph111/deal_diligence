import { useState, useCallback, useRef, type DragEvent, type ChangeEvent } from 'react';
import { Upload, FileUp, X, AlertCircle } from 'lucide-react';
import { validateFile, type FileValidationError } from '../../../api/services/documents.service';

interface UploadDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  multiple?: boolean;
  className?: string;
  compact?: boolean;
}

export function UploadDropZone({
  onFilesSelected,
  disabled = false,
  multiple = true,
  className = '',
  compact = false,
}: UploadDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [validationErrors, setValidationErrors] = useState<FileValidationError[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) {
        return;
      }

      const files = Array.from(fileList);
      const errors: FileValidationError[] = [];
      const validFiles: File[] = [];

      for (const file of files) {
        const error = validateFile(file);
        if (error) {
          errors.push(error);
        } else {
          validFiles.push(file);
        }
      }

      setValidationErrors(errors);

      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }
    },
    [onFilesSelected]
  );

  const handleDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        setIsDragging(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        e.dataTransfer.dropEffect = 'copy';
      }
    },
    [disabled]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) {
        return;
      }

      const { files } = e.dataTransfer;
      if (!multiple && files.length > 1) {
        setValidationErrors([
          { filename: '', error: 'Only one file can be uploaded at a time' },
        ]);
        return;
      }

      processFiles(files);
    },
    [disabled, multiple, processFiles]
  );

  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      processFiles(e.target.files);
      // Reset input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [processFiles]
  );

  const handleClick = useCallback(() => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  }, [disabled]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        fileInputRef.current?.click();
      }
    },
    [disabled]
  );

  const clearErrors = useCallback(() => {
    setValidationErrors([]);
  }, []);

  if (compact) {
    return (
      <div className={`upload-drop-zone-compact ${className}`}>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileInputChange}
          multiple={multiple}
          disabled={disabled}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.jpg,.jpeg,.png,.gif,.webp,.tiff,.zip"
          className="upload-input-hidden"
        />
        <button
          type="button"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="button primary upload-button"
        >
          <Upload size={16} />
          Upload Files
        </button>

        {validationErrors.length > 0 && (
          <div className="upload-errors">
            <button
              type="button"
              className="upload-errors-close"
              onClick={clearErrors}
              aria-label="Clear errors"
            >
              <X size={14} />
            </button>
            {validationErrors.map((error, index) => (
              <div key={index} className="upload-error-item">
                <AlertCircle size={14} />
                <span>
                  {error.filename ? `${error.filename}: ` : ''}
                  {error.error}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`upload-drop-zone-container ${className}`}>
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileInputChange}
        multiple={multiple}
        disabled={disabled}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.jpg,.jpeg,.png,.gif,.webp,.tiff,.zip"
        className="upload-input-hidden"
      />

      <div
        className={`upload-drop-zone ${isDragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="button"
        aria-label="Drop files here or click to upload"
      >
        <div className="upload-drop-zone-content">
          <div className="upload-icon">
            {isDragging ? <FileUp size={48} /> : <Upload size={48} />}
          </div>
          <div className="upload-text">
            {isDragging ? (
              <p className="upload-primary-text">Drop files here</p>
            ) : (
              <>
                <p className="upload-primary-text">
                  Drag and drop files here, or click to browse
                </p>
                <p className="upload-secondary-text">
                  Supported: PDF, Word, Excel, PowerPoint, images, and ZIP files (max 100MB each)
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {validationErrors.length > 0 && (
        <div className="upload-errors">
          <button
            type="button"
            className="upload-errors-close"
            onClick={clearErrors}
            aria-label="Clear errors"
          >
            <X size={14} />
          </button>
          {validationErrors.map((error, index) => (
            <div key={index} className="upload-error-item">
              <AlertCircle size={14} />
              <span>
                {error.filename ? `${error.filename}: ` : ''}
                {error.error}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
