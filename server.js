const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

// Ensure directories exist
const uploadDir = path.join(__dirname, 'public/uploads');
const statusDir = path.join(__dirname, 'public/status');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(statusDir)) fs.mkdirSync(statusDir, { recursive: true });

// Multer setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = req.body.type || 'chat';
        cb(null, type === 'status' ? 'public/status/' : 'public/uploads/');
    },
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const type = req.body.type || 'chat';
    const basePath = type === 'status' ? '/status' : '/uploads';
    res.json({ success: true, fileUrl: basePath + '/' + req.file.filename, fileName: req.file.originalname, fileSize: req.file.size });
});

app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));
app.use('/status', express.static('public/status'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/chat.html', (req, res) => res.sendFile(path.join(__dirname, 'public/chat.html')));
app.get('/marketplace.html', (req, res) => res.sendFile(path.join(__dirname, 'public/marketplace.html')));
app.get('/animation.html', (req, res) => res.sendFile(path.join(__dirname, 'public/animation.html')));
app.get('/converter.html', (req, res) => res.sendFile(path.join(__dirname, 'public/converter.html')));
app.get('/api/statuses', (req, res) => res.json(statuses));

// ============ FILE CONVERSION ============
app.post('/api/convert/text-to-pdf', (req, res) => {
    const { text, filename } = req.body;
    if (!text) return res.status(400).json({ error: 'No text provided' });
    const outputPath = path.join(__dirname, `public/uploads/converted_${Date.now()}.pdf`);
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    doc.fontSize(12).text(text, { align: 'left', width: 500 });
    doc.end();
    stream.on('finish', () => {
        res.json({ success: true, fileUrl: `/uploads/${path.basename(outputPath)}`, fileName: `${filename || 'document'}.pdf` });
    });
    stream.on('error', () => res.status(500).json({ error: 'Conversion failed' }));
});

app.get('/api/convert/supported', (req, res) => {
    res.json({ formats: ['text', 'txt', 'word', 'excel', 'powerpoint', 'image'], to: ['pdf'] });
});

// ============ BUSINESS ============
let businesses = [];
let products = [];
let orders = [];

app.post('/api/business/register', (req, res) => {
    const { userId, businessName, legalName, location, description } = req.body;
    if (!legalName || !location) return res.status(400).json({ error: 'Legal name and location required' });
    const existing = businesses.find(b => b.ownerId === userId);
    if (existing) return res.status(400).json({ error: 'Business already registered' });
    const user = users.find(u => u.id === userId);
    const newBusiness = { id: Date.now().toString(), ownerId: userId, ownerName: user?.name, businessName: businessName || user?.name + "'s Shop", legalName, location, description: description || '', verified: false, rating: 0, totalSales: 0, createdAt: Date.now() };
    businesses.push(newBusiness);
    res.json({ success: true, business: newBusiness });
});

app.get('/api/business/:userId', (req, res) => {
    res.json(businesses.find(b => b.ownerId === req.params.userId) || null);
});

app.post('/api/business/product', upload.array('images', 5), (req, res) => {
    const { businessId, name, description, price, category, stock } = req.body;
    const business = businesses.find(b => b.id === businessId);
    if (!business) return res.status(404).json({ error: 'Business not found' });
    const imageUrls = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
    const newProduct = { id: Date.now().toString(), businessId, businessName: business.businessName, name, description, price: parseFloat(price), category: category || 'general', stock: parseInt(stock) || 0, images: imageUrls, rating: 0, reviews: [], createdAt: Date.now(), status: 'active' };
    products.push(newProduct);
    res.json({ success: true, product: newProduct });
});

app.get('/api/products', (req, res) => res.json(products.filter(p => p.status === 'active')));
app.get('/api/business/:businessId/products', (req, res) => res.json(products.filter(p => p.businessId === req.params.businessId)));

app.post('/api/order/create', (req, res) => {
    const { buyerId, productId, quantity } = req.body;
    const product = products.find(p => p.id === productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.stock < quantity) return res.status(400).json({ error: 'Insufficient stock' });
    const totalAmount = product.price * quantity;
    const order = { id: Date.now().toString(), buyerId, buyerName: users.find(u => u.id === buyerId)?.name || 'Unknown', sellerId: product.businessId, sellerName: product.businessName, productId, productName: product.name, quantity, unitPrice: product.price, totalAmount, status: 'pending', deliveryCode: Math.floor(100000 + Math.random() * 900000).toString(), createdAt: Date.now(), tracking: [] };
    orders.push(order);
    res.json({ success: true, order });
});

app.post('/api/order/confirm-delivery', (req, res) => {
    const { orderId, deliveryCode } = req.body;
    const order = orders.find(o => o.id === orderId);
    if (order && order.deliveryCode === deliveryCode) {
        order.status = 'completed';
        const product = products.find(p => p.id === order.productId);
        if (product) product.stock -= order.quantity;
        res.json({ success: true, message: 'Delivery confirmed!' });
    } else {
        res.status(400).json({ error: 'Invalid code' });
    }
});

app.get('/api/orders/user/:userId', (req, res) => res.json(orders.filter(o => o.buyerId === req.params.userId)));

// ============ AI ANIMATION ============
let animations = [];

app.post('/api/animation/create', (req, res) => {
    const { story, userId, userName, actors, style } = req.body;
    if (!story || story.length < 10) return res.status(400).json({ error: 'Story too short' });
    const animation = { id: Date.now().toString(), userId, userName, story, actors: actors || [], style: style || 'modern', status: 'processing', progress: 0, createdAt: Date.now(), likes: 0, comments: [] };
    animations.push(animation);
    const interval = setInterval(() => {
        if (animation.progress < 100) { animation.progress += 20; }
        else { clearInterval(interval); animation.status = 'completed'; }
    }, 500);
    res.json({ success: true, animation });
});

app.get('/api/animations/user/:userId', (req, res) => res.json(animations.filter(a => a.userId === req.params.userId)));
app.get('/api/animations/feed', (req, res) => res.json(animations.filter(a => a.status === 'completed').slice(-20)));

// ============ DATA STORES ============
let users = [];
let statuses = [];
let groups = [];

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
    console.log('✅ Connected:', socket.id);
    
    socket.on('user-join', (user) => {
        const existing = users.find(u => u.id === user.id);
        if (!existing) { user.socketId = socket.id; users.push(user); console.log(`📱 ${user.name} joined (${users.length})`); }
        else { existing.socketId = socket.id; }
        io.emit('users-list', users);
        socket.emit('existing-statuses', statuses);
        socket.emit('existing-groups', groups);
    });
    
    // ============ PRIVATE CHAT ============
    socket.on('send-message', (data) => {
        const receiver = users.find(u => u.id === data.receiverId);
        if (receiver) io.to(receiver.socketId).emit('new-message', data);
    });
    
    // ============ STATUS ============
    socket.on('post-status', (data) => {
        const newStatus = { id: Date.now(), userId: data.userId, userName: data.userName, userAvatar: data.userAvatar, type: data.type, content: data.content, backgroundColor: data.backgroundColor, timestamp: Date.now(), views: [], reactions: [] };
        statuses.unshift(newStatus);
        io.emit('new-status', newStatus);
    });
    
    // ============ GROUPS ============
    socket.on('create-group', (data) => {
        const newGroup = {
            id: Date.now().toString(),
            name: data.name,
            description: data.description || '',
            createdBy: data.createdBy,
            createdByName: data.createdByName,
            members: data.members || [{ id: data.createdBy, name: data.createdByName }],
            admins: [data.createdBy],
            messages: [],
            createdAt: Date.now()
        };
        groups.push(newGroup);
        newGroup.members.forEach(member => {
            const memberUser = users.find(u => u.id === member.id);
            if (memberUser) io.to(memberUser.socketId).emit('group-created', newGroup);
        });
        io.emit('groups-update', groups);
        console.log(`👥 Group created: ${data.name} by ${data.createdByName}`);
    });
    
    socket.on('send-group-message', (data) => {
        const group = groups.find(g => g.id === data.groupId);
        if (group) {
            const message = { id: Date.now(), senderId: data.senderId, senderName: data.senderName, content: data.content, timestamp: Date.now() };
            group.messages.push(message);
            group.members.forEach(member => {
                const memberUser = users.find(u => u.id === member.id);
                if (memberUser) {
                    io.to(memberUser.socketId).emit('group-message', { groupId: group.id, ...message });
                }
            });
        }
    });
    
    // Delete message in group
    socket.on('delete-group-message', (data) => {
        const { groupId, messageId, userId, forEveryone } = data;
        const group = groups.find(g => g.id === groupId);
        if (group) {
            const messageIndex = group.messages.findIndex(m => m.id == messageId);
            if (messageIndex !== -1) {
                const message = group.messages[messageIndex];
                const isAdmin = group.admins?.includes(userId);
                const isSender = message.senderId === userId;
                
                if (forEveryone && (isSender || isAdmin)) {
                    group.messages[messageIndex].deleted = true;
                    group.messages[messageIndex].content = 'This message was deleted';
                } else if (!forEveryone) {
                    if (!message.deletedFor) message.deletedFor = [];
                    message.deletedFor.push(userId);
                }
                
                group.members.forEach(member => {
                    const memberUser = users.find(u => u.id === member.id);
                    if (memberUser) {
                        io.to(memberUser.socketId).emit('group-message-deleted', {
                            groupId: group.id,
                            messageId: messageId,
                            deletedFor: message.deletedFor || [],
                            deleted: message.deleted || false
                        });
                    }
                });
            }
        }
    });
    
    // Edit message in group
    socket.on('edit-group-message', (data) => {
        const { groupId, messageId, userId, newContent } = data;
        const group = groups.find(g => g.id === groupId);
        if (group) {
            const message = group.messages.find(m => m.id == messageId);
            if (message && message.senderId === userId) {
                message.content = newContent;
                message.edited = true;
                message.editedAt = Date.now();
                
                group.members.forEach(member => {
                    const memberUser = users.find(u => u.id === member.id);
                    if (memberUser) {
                        io.to(memberUser.socketId).emit('group-message-edited', {
                            groupId: group.id,
                            messageId: messageId,
                            newContent: newContent
                        });
                    }
                });
            }
        }
    });
    
    // Add member to group
    socket.on('add-group-member', (data) => {
        const { groupId, adminId, newMemberId, newMemberName } = data;
        const group = groups.find(g => g.id === groupId);
        if (group && group.admins?.includes(adminId)) {
            if (!group.members.find(m => m.id === newMemberId)) {
                group.members.push({ id: newMemberId, name: newMemberName });
                group.members.forEach(member => {
                    const memberUser = users.find(u => u.id === member.id);
                    if (memberUser) {
                        io.to(memberUser.socketId).emit('group-member-added', {
                            groupId: group.id,
                            newMember: { id: newMemberId, name: newMemberName }
                        });
                        io.to(memberUser.socketId).emit('groups-update', groups);
                    }
                });
            }
        }
    });
    
    // Remove member from group
    socket.on('remove-group-member', (data) => {
        const { groupId, adminId, memberId, memberName } = data;
        const group = groups.find(g => g.id === groupId);
        if (group && group.admins?.includes(adminId) && adminId !== memberId) {
            group.members = group.members.filter(m => m.id !== memberId);
            group.members.forEach(member => {
                const memberUser = users.find(u => u.id === member.id);
                if (memberUser) {
                    io.to(memberUser.socketId).emit('group-member-removed', {
                        groupId: group.id,
                        removedMember: memberName
                    });
                    io.to(memberUser.socketId).emit('groups-update', groups);
                }
            });
            const removedUser = users.find(u => u.id === memberId);
            if (removedUser) io.to(removedUser.socketId).emit('group-removed', group.id);
        }
    });
    
    // Make admin
    socket.on('make-group-admin', (data) => {
        const { groupId, adminId, memberId } = data;
        const group = groups.find(g => g.id === groupId);
        if (group && group.admins?.includes(adminId) && !group.admins.includes(memberId)) {
            group.admins.push(memberId);
            group.members.forEach(member => {
                const memberUser = users.find(u => u.id === member.id);
                if (memberUser) {
                    io.to(memberUser.socketId).emit('group-admin-updated', {
                        groupId: group.id,
                        newAdminId: memberId
                    });
                    io.to(memberUser.socketId).emit('groups-update', groups);
                }
            });
        }
    });
    
    socket.on('disconnect', () => {
        users = users.filter(u => u.socketId !== socket.id);
        io.emit('users-list', users);
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   🎬 SCOPEFLIX RUNNING! 🎬            ║');
    console.log('║   http://localhost:3000               ║');
    console.log('╚════════════════════════════════════════╝\n');
});
