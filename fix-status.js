// Fix status in chat.html - add this script at the end of body
<script>
// Refresh status functionality
function refreshStatus() {
    console.log('Refreshing status...');
    fetch('/api/statuses')
        .then(res => res.json())
        .then(statuses => {
            const container = document.getElementById('statusList');
            if (!container) return;
            
            const myStatuses = statuses.filter(s => s.userId === currentUser?.id);
            const otherStatuses = statuses.filter(s => s.userId !== currentUser?.id);
            
            let html = `<div class="status-item" onclick="openPostStatusModal()">
                <div class="status-ring"><div class="status-ring-inner"><div class="status-avatar add-status">+</div></div></div>
                <div class="status-name">My Status</div>
            </div>`;
            
            if (myStatuses.length > 0) {
                html += `<div class="status-item" onclick="viewStatusById('${myStatuses[0].id}')">
                    <div class="status-ring"><div class="status-ring-inner"><div class="status-avatar">${currentUser?.avatar}</div></div></div>
                    <div class="status-name">${currentUser?.name}</div>
                </div>`;
            }
            
            const uniqueUsers = new Map();
            otherStatuses.forEach(status => {
                if (!uniqueUsers.has(status.userId)) {
                    uniqueUsers.set(status.userId, status);
                }
            });
            
            for (const [userId, status] of uniqueUsers) {
                html += `<div class="status-item" onclick="viewStatusById('${status.id}')">
                    <div class="status-ring"><div class="status-ring-inner"><div class="status-avatar">${status.userAvatar}</div></div></div>
                    <div class="status-name">${status.userName}</div>
                </div>`;
            }
            container.innerHTML = html;
        });
}

// Override viewStatus
window.viewStatusById = function(statusId) {
    fetch('/api/statuses')
        .then(res => res.json())
        .then(statuses => {
            const status = statuses.find(s => s.id == statusId);
            if (status) {
                alert(`${status.userName}: ${status.content}\n\nPosted: ${new Date(status.timestamp).toLocaleString()}`);
                socket.emit('view-status', { statusId: status.id, userId: currentUser.id, userName: currentUser.name });
            }
        });
}

// Call refresh on load
setTimeout(refreshStatus, 1000);
</script>
