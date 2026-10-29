// server/lib/reservedBrands.js
//
// BIG BRANDS NOBODY CAN TAKE AS A CREATOR NAME.
//
// The founder: reserve the top brands — Netflix, Amazon and the rest — so
// nobody can collect payments at a name people will read as the company.
// Blocked as EITHER part of a name (netflix, netflix.india, india.netflix),
// and in other spellings of it: नेटफ्लिक्स is read through the same loose
// key search uses (lib/searchKey.js), with x/ks and c/k folded so a Hindi
// spelling lands on the brand.
//
// Loose matching is only used for brands of five letters or more. A short
// brand's loose key is short enough to catch ordinary words, so those are
// matched exactly as written.
//
// A few brands that are also everyday words a shop is named with (shell,
// hero, boat, dove, tide, metro, trends…) are deliberately NOT here:
// blocking them would take real names off real shops. A brand that wants
// its name gets it through GLOOBAL, which is what the refusal says.
const searchKey = require('./searchKey');

const RESERVED_BRANDS = [
  'google', 'alphabet', 'youtube', 'gmail', 'android', 'chrome', 'microsoft',
  'windows', 'xbox', 'linkedin', 'github', 'skype', 'outlook', 'apple',
  'iphone', 'ipad', 'macbook', 'icloud', 'itunes', 'airpods', 'amazon',
  'primevideo', 'alexa', 'kindle', 'audible', 'aws', 'meta', 'facebook',
  'instagram', 'whatsapp', 'messenger', 'oculus', 'netflix', 'spotify',
  'disney', 'disneyplus', 'hotstar', 'jiohotstar', 'hulu', 'hbo', 'hbomax',
  'zee5', 'sonyliv', 'voot', 'altbalaji', 'mxplayer', 'jiocinema', 'twitter',
  'tiktok', 'snapchat', 'pinterest', 'reddit', 'telegram', 'discord', 'wechat',
  'weibo', 'quora', 'tumblr', 'twitch', 'slack', 'dropbox', 'openai',
  'chatgpt', 'anthropic', 'copilot', 'perplexity', 'midjourney', 'samsung',
  'sony', 'panasonic', 'philips', 'toshiba', 'hitachi', 'lenovo', 'dell',
  'asus', 'acer', 'msi', 'intel', 'amd', 'nvidia', 'qualcomm', 'ibm', 'oracle',
  'sap', 'salesforce', 'adobe', 'cisco', 'vmware', 'huawei', 'xiaomi', 'redmi',
  'oneplus', 'oppo', 'vivo', 'realme', 'iqoo', 'motorola', 'nokia',
  'blackberry', 'uber', 'lyft', 'airbnb', 'booking', 'expedia', 'tripadvisor',
  'makemytrip', 'goibibo', 'yatra', 'cleartrip', 'ixigo', 'redbus', 'irctc',
  'easemytrip', 'ebay', 'alibaba', 'aliexpress', 'taobao', 'shopee', 'lazada',
  'temu', 'shein', 'etsy', 'walmart', 'costco', 'ikea', 'bestbuy', 'flipkart',
  'myntra', 'ajio', 'meesho', 'nykaa', 'snapdeal', 'shopclues', 'tatacliq',
  'jiomart', 'bigbasket', 'blinkit', 'zepto', 'instamart', 'dunzo', 'swiggy',
  'zomato', 'dineout', 'eatsure', 'magicpin', 'paytm', 'phonepe', 'gpay',
  'googlepay', 'bhim', 'upi', 'npci', 'rupay', 'mobikwik', 'freecharge',
  'cred', 'razorpay', 'cashfree', 'instamojo', 'payu', 'billdesk', 'pinelabs',
  'bharatpe', 'paypal', 'venmo', 'stripe', 'wise', 'revolut', 'payoneer',
  'westernunion', 'moneygram', 'remitly', 'xoom', 'skrill', 'neteller',
  'klarna', 'afterpay', 'cashapp', 'zelle', 'visa', 'mastercard', 'amex',
  'americanexpress', 'dinersclub', 'unionpay', 'jcb', 'binance', 'coinbase',
  'kraken', 'bitcoin', 'ethereum', 'tether', 'wazirx', 'coindcx', 'coinswitch',
  'zebpay', 'ola', 'rapido', 'olacabs', 'olaelectric', 'blusmart', 'yulu',
  'byjus', 'unacademy', 'vedantu', 'physicswallah', 'upgrad', 'simplilearn',
  'coursera', 'udemy', 'edx', 'khanacademy', 'duolingo', 'toppr', 'whitehatjr',
  'practo', 'pharmeasy', 'netmeds', 'onemg', 'medplus', 'apollo',
  'apollopharmacy', 'healthkart', 'cultfit', 'curefit', 'lenskart', 'tanishq',
  'fastrack', 'caratlane', 'malabar', 'kalyan', 'joyalukkas', 'policybazaar',
  'bankbazaar', 'paisabazaar', 'groww', 'zerodha', 'upstox', 'angelone',
  'angelbroking', 'smallcase', 'naukri', 'indeed', 'glassdoor', 'justdial',
  'sulekha', 'urbanclap', 'urbancompany', 'housing', 'nobroker', 'magicbricks',
  '99acres', 'squareyards', 'truecaller', 'sharechat', 'roposo', 'kooapp',
  'dailyhunt', 'inshorts', 'sbi', 'statebank', 'hdfc', 'hdfcbank', 'icici',
  'icicibank', 'axis', 'axisbank', 'kotak', 'kotakbank', 'yesbank', 'indusind',
  'idfc', 'idfcfirst', 'bandhan', 'rbl', 'federalbank', 'aubank', 'pnb',
  'punjabnational', 'bankofbaroda', 'canara', 'canarabank', 'unionbank',
  'indianbank', 'iob', 'centralbank', 'ucobank', 'bankofindia', 'lic',
  'bajajfinserv', 'bajajfinance', 'muthoot', 'manappuram', 'shriram',
  'sbilife', 'hdfclife', 'iciciprudential', 'maxlife', 'tataaia', 'starhealth',
  'nivabupa', 'hsbc', 'citi', 'citibank', 'jpmorgan', 'bankofamerica',
  'wellsfargo', 'goldmansachs', 'morganstanley', 'barclays', 'lloyds',
  'natwest', 'santander', 'bnp', 'ubs', 'creditsuisse', 'deutschebank',
  'standardchartered', 'dbs', 'ocbc', 'uob', 'maybank', 'blackrock',
  'vanguard', 'fidelity', 'schwab', 'robinhood', 'etoro', 'tata', 'reliance',
  'jio', 'jiofiber', 'adani', 'birla', 'adityabirla', 'mahindra', 'bajaj',
  'godrej', 'wipro', 'infosys', 'tcs', 'hcl', 'techmahindra', 'larsen', 'lnt',
  'vedanta', 'jsw', 'essar', 'hindalco', 'ultratech', 'ambuja', 'ongc', 'ntpc',
  'bhel', 'sail', 'gail', 'iocl', 'indianoil', 'hpcl', 'bpcl', 'coalindia',
  'powergrid', 'airtel', 'vodafone', 'vodafoneidea', 'bsnl', 'mtnl', 'maruti',
  'suzuki', 'marutisuzuki', 'hyundai', 'kia', 'tatamotors', 'toyota', 'honda',
  'nissan', 'renault', 'skoda', 'volkswagen', 'mgmotor', 'jeep', 'ford',
  'chevrolet', 'bmw', 'mercedes', 'mercedesbenz', 'audi', 'porsche', 'ferrari',
  'lamborghini', 'tesla', 'volvo', 'jaguar', 'landrover', 'rollsroyce',
  'bentley', 'heromotocorp', 'tvs', 'royalenfield', 'yamaha', 'ktm',
  'harleydavidson', 'ather', 'bajajauto', 'airindia', 'vistara', 'spicejet',
  'akasa', 'goair', 'emirates', 'qatarairways', 'etihad', 'lufthansa',
  'britishairways', 'singaporeairlines', 'oyo', 'taj', 'tajhotels', 'marriott',
  'hilton', 'hyatt', 'itchotels', 'oberoi', 'lemontree', 'radisson',
  'mcdonalds', 'kfc', 'burgerking', 'dominos', 'pizzahut', 'subway',
  'starbucks', 'dunkin', 'costa', 'cafecoffeeday', 'ccd', 'tacobell', 'wendys',
  'papajohns', 'baskinrobbins', 'haagendazs', 'cocacola', 'coke', 'pepsi',
  'sprite', 'fanta', 'thumsup', 'limca', 'mountaindew', 'redbull', 'nescafe',
  'nestle', 'maggi', 'kitkat', 'cadbury', 'dairymilk', 'oreo', 'amul',
  'britannia', 'parle', 'haldiram', 'haldirams', 'bikaji', 'lays', 'kurkure',
  'bingo', 'unibic', 'sunfeast', 'mtr', 'everest', 'mdh', 'tataconsumer',
  'tatasalt', 'tatatea', 'motherdairy', 'milma', 'aavin', 'hatsun', 'bisleri',
  'aquafina', 'hindustanunilever', 'hul', 'unilever', 'proctergamble', 'pandg',
  'colgate', 'palmolive', 'dabur', 'patanjali', 'marico', 'itc', 'emami',
  'godrejconsumer', 'jyothy', 'dettol', 'lifebuoy', 'pears', 'nivea', 'ponds',
  'lakme', 'loreal', 'maybelline', 'garnier', 'gillette', 'oralb', 'pampers',
  'huggies', 'vicks', 'surfexcel', 'ariel', 'rin', 'vim', 'harpic', 'lizol',
  'nike', 'adidas', 'reebok', 'puma', 'asics', 'newbalance', 'skechers',
  'converse', 'underarmour', 'zara', 'uniqlo', 'gucci', 'prada',
  'louisvuitton', 'chanel', 'hermes', 'dior', 'versace', 'armani', 'burberry',
  'balenciaga', 'rolex', 'cartier', 'levis', 'wrangler', 'pepejeans',
  'tommyhilfiger', 'calvinklein', 'uspolo', 'allensolly', 'vanheusen',
  'peterengland', 'louisphilippe', 'raymond', 'manyavar', 'fabindia', 'biba',
  'westside', 'pantaloons', 'maxfashion', 'shoppersstop', 'reliancetrends',
  'vmart', 'bata', 'woodland', 'redtape', 'dmart', 'bigbazaar', 'spencers',
  'moremegastore', 'starbazaar', 'vishalmegamart', 'croma', 'reliancedigital',
  'vijaysales', 'decathlon', 'firstcry', 'hamleys', 'bcci', 'ipl', 'icc',
  'fifa', 'olympics', 'nba', 'nfl', 'premierleague', 'timesofindia', 'ndtv',
  'aajtak', 'indiatoday', 'zeenews', 'abpnews', 'thehindu', 'hindustantimes',
  'dainikbhaskar', 'bbc', 'cnn', 'sunnxt', 'erosnow', 'fedex', 'dhl',
  'bluedart', 'delhivery', 'ekart', 'shadowfax', 'indiapost', 'mckinsey',
  'deloitte', 'pwc', 'kpmg', 'accenture', 'capgemini', 'cognizant', 'exxon',
  'chevron', 'aramco', 'boeing', 'airbus', 'lego', 'hasbro', 'mattel'
];

// The most-searched brands as they are written in Devanagari, which a
// letter-by-letter key cannot always reach (अमेज़ॉन is not "amazon"
// letter for letter).
const RESERVED_BRAND_ALIASES = {
  'अमेज़न': 'amazon', 'अमेज़ॉन': 'amazon', 'अमेजन': 'amazon', 'अमेजॉन': 'amazon', 'ऐमज़ॉन': 'amazon', 'गूगल': 'google', 'पेटीएम': 'paytm', 'फोनपे': 'phonepe', 'फ़ोनपे': 'phonepe', 'ज़ोमैटो': 'zomato', 'जोमैटो': 'zomato', 'टाटा': 'tata', 'रिलायंस': 'reliance', 'जियो': 'jio', 'एयरटेल': 'airtel', 'अमूल': 'amul', 'पारले': 'parle', 'बजाज': 'bajaj', 'महिंद्रा': 'mahindra', 'मारुति': 'maruti', 'इंफोसिस': 'infosys', 'विप्रो': 'wipro', 'अडानी': 'adani', 'बिरला': 'birla', 'गोदरेज': 'godrej', 'पतंजलि': 'patanjali', 'डाबर': 'dabur', 'हल्दीराम': 'haldiram', 'एसबीआई': 'sbi', 'एचडीएफसी': 'hdfc', 'आईसीआईसीआई': 'icici', 'एलआईसी': 'lic', 'यूट्यूब': 'youtube', 'फेसबुक': 'facebook', 'इंस्टाग्राम': 'instagram', 'व्हाट्सएप': 'whatsapp', 'व्हाट्सऐप': 'whatsapp', 'माइक्रोसॉफ्ट': 'microsoft', 'एप्पल': 'apple', 'सैमसंग': 'samsung', 'ओला': 'ola', 'उबर': 'uber', 'पेपाल': 'paypal', 'वीज़ा': 'visa', 'वीजा': 'visa', 'मास्टरकार्ड': 'mastercard', 'नेटफ्लिक्स': 'netflix', 'फ्लिपकार्ट': 'flipkart', 'स्विगी': 'swiggy', 'मिंत्रा': 'myntra', 'नायका': 'nykaa', 'ब्लिंकिट': 'blinkit', 'ज़ेप्टो': 'zepto', 'जेप्टो': 'zepto', 'बिगबास्केट': 'bigbasket', 'मीशो': 'meesho', 'ओयो': 'oyo', 'इंडिगो': 'indigo', 'एयरइंडिया': 'airindia', 'बायजूस': 'byjus', 'लेंसकार्ट': 'lenskart', 'तनिष्क': 'tanishq', 'कोकाकोला': 'cocacola', 'पेप्सी': 'pepsi', 'मैगी': 'maggi', 'कैडबरी': 'cadbury', 'नेस्ले': 'nestle', 'ब्रिटानिया': 'britannia', 'डोमिनोज': 'dominos', 'मैकडॉनल्ड्स': 'mcdonalds', 'स्टारबक्स': 'starbucks', 'केएफसी': 'kfc'
};

function brandKey(text) {
  return searchKey.looseKey(String(text || ''))
    .replace(/ch/g, '').replace(/c/g, 'k').replace(//g, 'ch')
    .replace(/x/g, 'ks')
    .replace(/([a-z])+/g, '$1');
}

const RESERVED_BRAND_EXACT = new Set(RESERVED_BRANDS);
const RESERVED_BRAND_ALIAS_NFC = new Map(Object.entries(RESERVED_BRAND_ALIASES).map(([k, v]) => [k.normalize('NFC'), v]));
const RESERVED_BRAND_LOOSE = new Map();
for (const b of RESERVED_BRANDS) {
  if (b.length >= 5) {
    const k = brandKey(b);
    if (k && !RESERVED_BRAND_LOOSE.has(k)) RESERVED_BRAND_LOOSE.set(k, b);
  }
}

// The brand a name part stands for, or '' when it is free.
function reservedBrandFor(part) {
  const p = String(part || '').trim().toLowerCase().normalize('NFC');
  if (!p) return '';
  if (RESERVED_BRAND_EXACT.has(p)) return p;
  if (RESERVED_BRAND_ALIAS_NFC.has(p)) return RESERVED_BRAND_ALIAS_NFC.get(p);
  const k = brandKey(p);
  if (k.length >= 4 && RESERVED_BRAND_LOOSE.has(k)) return RESERVED_BRAND_LOOSE.get(k);
  return '';
}

module.exports = { RESERVED_BRANDS, reservedBrandFor, brandKey };
