import { unzip } from 'fflate';

export interface ExtractedFile {
  name: string;
  path: string;
  content: string;
  size: number;
}

export interface ZipExtractionResult {
  files: ExtractedFile[];
  error?: string;
}

/**
 * Extract CSV/TXT files from a ZIP archive
 * Uses fflate for fast, lightweight decompression
 */
export async function extractCsvFromZip(file: File): Promise<ZipExtractionResult> {
  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Decompress the ZIP file
    const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(uint8Array, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });

    // Filter for CSV and TXT files, decode content
    const csvFiles: ExtractedFile[] = [];
    const decoder = new TextDecoder('utf-8');

    for (const [path, data] of Object.entries(files)) {
      // Skip directories (they end with /)
      if (path.endsWith('/')) continue;

      // Skip macOS resource fork files
      if (path.includes('__MACOSX') || path.startsWith('._')) continue;

      // Get the filename from the path
      const fileName = path.split('/').pop() || path;
      
      // Skip hidden files
      if (fileName.startsWith('.')) continue;

      // Check if it's a CSV or TXT file
      const lowerName = fileName.toLowerCase();
      if (lowerName.endsWith('.csv') || lowerName.endsWith('.txt')) {
        const content = decoder.decode(data);
        csvFiles.push({
          name: fileName,
          path: path,
          content: content,
          size: data.length,
        });
      }
    }

    return { files: csvFiles };
  } catch (error) {
    return {
      files: [],
      error: error instanceof Error ? error.message : 'Failed to extract ZIP file',
    };
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}



