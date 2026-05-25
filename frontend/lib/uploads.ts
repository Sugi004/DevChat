import api from "./axios";
import {PresignedResponse} from "@/types";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "avif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "m4v", "avi", "mkv"]);

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    avif: "image/avif",
    bmp: "image/bmp",
    ico: "image/x-icon",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    m4v: "video/x-m4v",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    pdf: "application/pdf",
    zip: "application/zip",
    tar: "application/x-tar",
    gz: "application/gzip",
    tgz: "application/gzip",
    bz2: "application/x-bzip2",
    xz: "application/x-xz",
    "7z": "application/x-7z-compressed",
    rar: "application/vnd.rar",
    json: "application/json",
    xml: "application/xml",
    md: "text/markdown",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    html: "text/html",
    css: "text/css",
    js: "text/javascript",
    mjs: "text/javascript",
    cjs: "text/javascript",
    py: "text/x-python",
    java: "text/x-java-source",
    php: "application/x-httpd-php",
    sql: "application/sql",
    sh: "text/x-shellscript",
    bash: "text/x-shellscript",
    zsh: "text/x-shellscript",
};

const TEXT_LIKE_EXTENSIONS = new Set([
    "txt", "md", "csv", "tsv", "log", "json", "xml", "yaml", "yml", "toml", "ini",
    "cfg", "conf", "env", "js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "pyi", "java",
    "kt", "kts", "swift", "go", "rs", "rb", "php", "c", "h", "cc", "hh", "cpp", "cxx",
    "hpp", "cs", "scala", "sql", "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd",
    "html", "css", "scss", "sass", "less", "vue", "svelte", "astro", "graphql", "gql",
    "prisma", "gradle", "properties", "lock", "gitignore", "dockerignore", "npmrc",
    "editorconfig", "prettierrc", "eslintrc", "babelrc", "r", "lua", "dart", "elm",
    "erl", "ex", "exs"
]);

function getFileExtension(fileName: string): string {
    const trimmed = fileName.trim();
    const lastDot = trimmed.lastIndexOf(".");
    if (lastDot === -1) return "";
    return trimmed.slice(lastDot + 1).toLowerCase();
}

function normalizeMime(mime?: string): string {
    return (mime ?? "").split(";", 1)[0].trim().toLowerCase();
}

export const inferUploadContentType = (file: Pick<File, "name" | "type">): string => {
    const provided = normalizeMime(file.type);
    if (provided) return provided;

    const ext = getFileExtension(file.name);
    if (ext && EXTENSION_CONTENT_TYPES[ext]) {
        return EXTENSION_CONTENT_TYPES[ext];
    }

    if (ext && TEXT_LIKE_EXTENSIONS.has(ext)) {
        return "text/plain";
    }

    return "application/octet-stream";
};

export const getPresignedUrl = async (file_name: string, file_type: string, file_size: number): Promise<PresignedResponse> => {
    const {data} = await api.post("/uploads/presigned-url", {file_name, content_type: file_type, file_size});
    return data;
}

/**
 * Get presigned URL from backend
 * Put file directly to S3
 * Return the public file_url to embed in the message
 **/

export const uploadFile = async (file: File, onProgress?: (p: number) => void): Promise<string> => {
    const requestedContentType = inferUploadContentType(file);
    const {upload_url, file_url, content_type} = await getPresignedUrl(file.name, requestedContentType, file.size);
    await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.responseType = "text";
        xhr.open("PUT", upload_url);
        xhr.setRequestHeader("Content-Type", content_type);
        if (onProgress){
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable){
                    onProgress(Math.round((e.loaded / e.total) * 100));
                }
            };
        }
        xhr.onload = () => {
            if (xhr.status < 300) {
                resolve();
                return;
            }
            const details = xhr.responseText?.trim() || xhr.statusText || "Unknown upload error";
            reject(new Error(`Upload failed (${xhr.status}): ${details}`));
        };
        xhr.onerror = () => reject(new Error("S3 Upload, network error"));
        xhr.send(file);
    });
    return file_url;
}

export const messageTypeFromFile = (file: Pick<File, "name" | "type">): "image" | "video" | "file" => {
    const mime = inferUploadContentType(file);
    const ext = getFileExtension(file.name);
    if (mime.startsWith("image/") || IMAGE_EXTENSIONS.has(ext)) return "image";
    if (mime.startsWith("video/") || VIDEO_EXTENSIONS.has(ext)) return "video";
    return "file";
}
    
