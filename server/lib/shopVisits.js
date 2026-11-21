// How many different people have visited a shop — its GLOOBAL shop page or
// its Social profile. One row per shop and verified visitor (ContentView,
// kind 'shop'), so a person who comes back ten times counts once, and the
// shop's own people never count.
const ContentView = require('../models/ContentView');

const same = (a, b) => Boolean(a && b) && String(a) === String(b);

async function recordShopVisit(shop, viewerId) {
  if (!shop || !shop._id || !viewerId) return false;
  if (same(shop._id, viewerId) || same(shop.shopOwnerId, viewerId)) return false;
  try {
    await ContentView.updateOne(
      { media: shop._id, viewer: viewerId },
      { $inc: { count: 1 }, $set: { lastAt: new Date(), owner: shop._id }, $setOnInsert: { kind: 'shop' } },
      { upsert: true }
    );
    return true;
  } catch (e) { return false; }
}

async function shopVisitors(shopId) {
  if (!shopId) return 0;
  try { return await ContentView.countDocuments({ kind: 'shop', media: shopId }); } catch (e) { return 0; }
}

module.exports = { recordShopVisit, shopVisitors };
