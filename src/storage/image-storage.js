export class ImageStorage {
    async put({ key, buffer, mimeType }) {
        void key;
        void buffer;
        void mimeType;
        throw new Error('ImageStorage.put() must be implemented.');
    }

    async getBuffer(key) {
        void key;
        throw new Error('ImageStorage.getBuffer() must be implemented.');
    }

    async createReadStream(key) {
        void key;
        throw new Error('ImageStorage.createReadStream() must be implemented.');
    }

    async delete(key) {
        void key;
        throw new Error('ImageStorage.delete() must be implemented.');
    }
}
