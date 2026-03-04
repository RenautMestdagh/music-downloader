// public/javascripts/playlistManager.js
class PlaylistManager {
    constructor() {
        this.playlists = window.playlists || [];
        this.currentTitle = window.currentTitle || 'Playlist Config';
        this.editingPlaylistIndex = null;
        this.init();
    }

    init() {
        this.renderPlaylists();
        this.setupEventListeners();
    }

    renderPlaylists() {
        const container = document.getElementById('playlistsList');
        if (!container) return;

        container.innerHTML = '';

        this.playlists.forEach((playlist, index) => {
            try {
                const element = this.createPlaylistElement(playlist, index);
                container.appendChild(element);
            } catch (error) {
                console.error(`Error rendering playlist:`,error);
            }
        });
    }

    createPlaylistElement(playlist, index) {
        const element = document.createElement('div');
        element.className = 'playlist-item';

        const ytId = playlist.yt_id || '';
        const name = playlist.name || '';

        element.innerHTML = `
            <div class="playlist-header">
                <h3 class="playlist-title">${name}</h3>
                <div class="playlist-actions">
                    <button type="button" class="btn-edit" onclick="playlistManager.editPlaylist(${index})" title="Edit playlist">
                        ✏️
                    </button>
                    <button type="button" class="btn-remove" onclick="playlistManager.removePlaylist(${index})" title="Delete playlist">
                        🗑️
                    </button>
                </div>
            </div>
            
            <div class="playlist-info">
                <div class="playlist-info-row">
                    <span>YouTube ID:</span>
                    <span>
                        <a href="https://music.youtube.com/playlist?list=${ytId}" target="_blank" class="yt-link">
                            ${ytId}
                        </a>
                    </span>
                </div>
            </div>
        `;
        return element;
    }

    showAddPlaylistModal() {
        this.editingPlaylistIndex = null;

        const modal = document.getElementById('playlistModal');
        const modalTitle = document.getElementById('modalTitle');
        const nameInput = document.getElementById('playlistName');
        const ytIdInput = document.getElementById('playlistYtId');
        const validationEl = document.getElementById('playlistValidation');
        const saveBtn = document.getElementById('modalSaveBtn');

        if (!modal || !modalTitle || !nameInput || !ytIdInput || !validationEl || !saveBtn) {
            this.showAlert('Error: Modal elements not found. Please refresh the page.', 'error');
            return;
        }

        modalTitle.textContent = 'Add New Playlist';
        saveBtn.textContent = 'Add Playlist';

        nameInput.value = '';
        ytIdInput.value = '';
        validationEl.textContent = '';
        validationEl.className = 'validation-message';

        modal.style.display = 'flex';
        nameInput.focus();
    }

    editPlaylist(index) {
        this.editingPlaylistIndex = index;
        const playlist = this.playlists[index];

        const modal = document.getElementById('playlistModal');
        const modalTitle = document.getElementById('modalTitle');
        const nameInput = document.getElementById('playlistName');
        const ytIdInput = document.getElementById('playlistYtId');
        const validationEl = document.getElementById('playlistValidation');
        const saveBtn = document.getElementById('modalSaveBtn');

        if (!modal || !modalTitle || !nameInput || !ytIdInput || !validationEl || !saveBtn) {
            this.showAlert('Error: Modal elements not found. Please refresh the page.', 'error');
            return;
        }

        modalTitle.textContent = 'Edit Playlist';
        saveBtn.textContent = 'Save Changes';

        nameInput.value = playlist.name || '';
        ytIdInput.value = playlist.yt_id || '';
        validationEl.textContent = '';
        validationEl.className = 'validation-message';

        modal.style.display = 'flex';
        nameInput.focus();
    }

    hidePlaylistModal() {
        const modal = document.getElementById('playlistModal');
        if (modal) {
            modal.style.display = 'none';
        }
        this.editingPlaylistIndex = null;
    }

    validatePlaylistForm() {
        const nameInput = document.getElementById('playlistName');
        const ytIdInput = document.getElementById('playlistYtId');
        const validationEl = document.getElementById('playlistValidation');

        if (!nameInput || !ytIdInput || !validationEl) {
            this.showAlert('Error: Form elements not found', 'error');
            return false;
        }

        const name = nameInput.value.trim();
        const ytId = ytIdInput.value.trim();

        validationEl.textContent = '';
        validationEl.className = 'validation-message';

        if (!name) {
            validationEl.textContent = 'Playlist name is required';
            validationEl.className = 'validation-message error';
            nameInput.focus();
            return false;
        }

        if (!ytId) {
            validationEl.textContent = 'YouTube playlist ID is required';
            validationEl.className = 'validation-message error';
            ytIdInput.focus();
            return false;
        }

        if (ytId.length !== 34) {
            validationEl.textContent = 'YouTube playlist ID must be exactly 34 characters';
            validationEl.className = 'validation-message error';
            ytIdInput.focus();
            return false;
        }

        const existingYtIds = this.playlists
            .map((playlist, index) => this.editingPlaylistIndex === index ? null : playlist.yt_id)
            .filter(ytId => ytId !== null);

        if (existingYtIds.includes(ytId)) {
            validationEl.textContent = 'This YouTube ID is already used in another playlist';
            validationEl.className = 'validation-message error';
            ytIdInput.focus();
            return false;
        }

        const existingNames = this.playlists
            .map((playlist, index) => this.editingPlaylistIndex === index ? null : playlist.name)
            .filter(name => name !== null);

        if (existingNames.includes(name)) {
            validationEl.textContent = 'A playlist with this name already exists';
            validationEl.className = 'validation-message error';
            nameInput.focus();
            return false;
        }

        validationEl.textContent = '✓ Valid playlist data';
        validationEl.className = 'validation-message valid';
        return true;
    }

    async savePlaylist() {
        if (!this.validatePlaylistForm()) {
            return;
        }

        const nameInput = document.getElementById('playlistName');
        const ytIdInput = document.getElementById('playlistYtId');

        const name = nameInput.value.trim();
        const ytId = ytIdInput.value.trim();

        if (this.editingPlaylistIndex !== null) {
            await this.updatePlaylist(this.editingPlaylistIndex, name, ytId);
        } else {
            await this.createPlaylist(name, ytId);
        }
    }

    async createPlaylist(name, ytId) {
        this.showAlert('Creating playlist...', 'info');

        try {
            const response = await fetch(`/api/playlists`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name,
                    yt_id: ytId
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const newPlaylist = await response.json();
            this.playlists.push(newPlaylist);
            this.renderPlaylists();
            this.hidePlaylistModal();
            this.showAlert('Playlist created successfully', 'success');

        } catch (error) {
            console.error(`Error creating playlist:`,error);
            this.showAlert(`Error creating playlist: ${error.message}`, 'error');
        }
    }

    async updatePlaylist(index, name, ytId) {
        const playlist = this.playlists[index];
        const playlistId = playlist.id;

        if (!playlistId) {
            this.showAlert('Error: Playlist ID not found', 'error');
            return;
        }

        this.showAlert('Updating playlist...', 'info');

        try {
            const response = await fetch(`/api/playlists/${playlistId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name,
                    yt_id: ytId
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            this.playlists[index].name = name;
            this.playlists[index].yt_id = ytId;
            this.renderPlaylists();
            this.hidePlaylistModal();
            this.showAlert('Playlist updated successfully', 'success');

        } catch (error) {
            console.error(`Error updating playlist:`,error);
            this.showAlert(`Error updating playlist: ${error.message}`, 'error');
        }
    }

    async removePlaylist(index) {
        const playlist = this.playlists[index];
        const playlistName = playlist.name;
        const playlistId = playlist.id;

        if (!playlistId) {
            this.showAlert('Error: Playlist ID not found', 'error');
            return;
        }

        if (!confirm(`Are you sure you want to delete playlist "${playlistName}"? This action cannot be undone.`)) {
            return;
        }

        this.showAlert('Deleting playlist...', 'info');

        try {
            const response = await fetch(`/api/playlists/${playlistId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            this.playlists.splice(index, 1);
            this.renderPlaylists();
            this.showAlert('Playlist deleted successfully', 'success');

        } catch (error) {
            console.error(`Error deleting playlist:`,error);
            this.showAlert(`Error deleting playlist: ${error.message}`, 'error');
        }
    }

    showAlert(message, type = 'info') {
        const alert = document.getElementById('statusAlert');
        const messageEl = document.getElementById('alertMessage');

        if (!alert || !messageEl) return;

        alert.className = `status-alert ${type}`;
        messageEl.textContent = message;
        alert.style.display = 'flex';

        if (type === 'success') {
            setTimeout(() => this.hideAlert(), 5000);
        }
    }

    hideAlert() {
        const alert = document.getElementById('statusAlert');
        if (alert) {
            alert.style.display = 'none';
        }
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('playlistModal');
                if (modal && modal.style.display === 'flex') {
                    this.hidePlaylistModal();
                }
            }
        });

        document.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const modal = document.getElementById('playlistModal');
                if (modal && modal.style.display === 'flex') {
                    if (e.target.id === 'playlistName' || e.target.id === 'playlistYtId') {
                        this.savePlaylist();
                    }
                }
            }
        });
    }
}

// Global functions
function showAddPlaylistModal() {
    if (window.playlistManager) {
        window.playlistManager.showAddPlaylistModal();
    }
}

function hidePlaylistModal() {
    if (window.playlistManager) {
        window.playlistManager.hidePlaylistModal();
    }
}

function savePlaylist() {
    if (window.playlistManager) {
        window.playlistManager.savePlaylist();
    }
}

function hideAlert() {
    if (window.playlistManager) {
        window.playlistManager.hideAlert();
    }
}

// Initialize when DOM is loaded
let playlistManager;
document.addEventListener('DOMContentLoaded', () => {
    if (window.playlists && typeof window.playlists === 'string') {
        try {
            window.playlists = JSON.parse(window.playlists);
        } catch (e) {
            window.playlists = [];
        }
    }

    try {
        playlistManager = new PlaylistManager();
        window.playlistManager = playlistManager;
    } catch (error) {
        console.error(`Error initializing PlaylistManager:`,error);
    }
});
