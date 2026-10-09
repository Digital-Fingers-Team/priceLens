import type { CategoryDefinition } from '../types';

/**
 * The curated category tree (category expansion, 2026-09-28).
 *
 * Two levels: groups are roots (level 0) and hold no products; leaves
 * (level 1) are what stores are swept for and products belong to.
 *
 *  - The original eleven electronics leaves are wave 0 (always swept) with
 *    minPriceEgp 0 (no price floor), exactly as they behaved before.
 *  - Every new leaf has a rollout wave >= 1 and no floor override, so the
 *    global MIN_LISTING_PRICE_EGP applies (code default 5,000; prod runs 0,
 *    no floor, since 2026-10-09). CATEGORY_SWEEP_MAX_WAVE
 *    decides how many waves are swept.
 *
 * Search terms: English first (the sweep sends the name plus the first
 * English terms to the stores), then Arabic (used only to resolve what users
 * type). A term belongs to one leaf only; category-tree.spec.ts enforces it,
 * because the free-text resolver picks a leaf by its terms.
 */

const group = (slug: string, name: string, nameAr: string, searchTerms: string[] = []): CategoryDefinition => ({
  slug,
  name,
  nameAr,
  level: 0,
  searchTerms,
});

const leaf = (
  parentSlug: string,
  rolloutWave: number,
  slug: string,
  name: string,
  nameAr: string,
  searchTerms: string[],
): CategoryDefinition => ({ slug, name, nameAr, parentSlug, level: 1, rolloutWave, searchTerms });

/** The original categories: unchanged terms, wave 0, no floor. */
const original = (slug: string, name: string, nameAr: string, searchTerms: string[]): CategoryDefinition => ({
  slug,
  name,
  nameAr,
  parentSlug: 'electronics',
  level: 1,
  rolloutWave: 0,
  minPriceEgp: 0,
  searchTerms,
});

export const categoryTree: CategoryDefinition[] = [
  // ─── Electronics (the original catalogue) ─────────────────────────────
  group('electronics', 'Electronics', 'إلكترونيات', ['electronics', 'tech', 'gadgets']),
  // Model-family words (iphone, rtx, ps5...) live in the resolver's
  // RESOLVER_ALIASES, not here: stored terms widen site search.
  original('smartphones', 'Smartphones', 'هواتف ذكية', ['phone', 'smartphone', 'mobile', 'cell phone', '5g phone', 'موبايل']),
  original('laptops', 'Laptops', 'لابتوب', ['laptop', 'notebook', 'ultrabook', 'chromebook', 'لاب توب']),
  original('graphics-cards', 'Graphics Cards', 'كروت شاشة', ['gpu', 'graphics card', 'video card', 'gfx card', 'كارت شاشة']),
  original('processors', 'CPUs', 'معالجات', ['cpu', 'processor', 'desktop processor', 'معالج']),
  original('monitors', 'Monitors', 'شاشات كمبيوتر', ['monitor', 'display', 'gaming monitor', 'computer screen', 'شاشة كمبيوتر']),
  original('televisions', 'TVs', 'تلفزيونات', ['tv', 'television', 'smart tv', 'oled tv', 'qled tv', 'تلفزيون', 'شاشة تلفزيون']),
  original('headphones', 'Headphones', 'سماعات', ['headphones', 'earbuds', 'wireless headphones', 'noise cancelling', 'سماعة']),
  original('tablets', 'Tablets', 'تابلت', ['tablet', 'ipad', 'android tablet', 'windows tablet', 'تابلت']),
  original('smart-watches', 'Smart Watches', 'ساعات ذكية', ['smart watch', 'smartwatch', 'fitness watch', 'wearable', 'ساعة ذكية']),
  original('gaming-consoles', 'Gaming Consoles', 'أجهزة ألعاب', ['console', 'gaming console', 'playstation', 'xbox', 'nintendo', 'بلايستيشن']),
  // Retired (wave -1: never swept, never resolved). It was a catch-all for
  // fridges, washers, air fryers...; those have leaves of their own now and
  // its products are moved there (scripts/ops/recategorize-products.ts).
  // Matching never compares across categories, so sweeping both would
  // duplicate every appliance. Kept so its unmoved products stay browsable.
  { ...original('home-appliances', 'Home Appliances', 'أجهزة منزلية', ['appliance', 'home appliance', 'home appliances', 'أجهزة منزلية']), rolloutWave: -1 },
  // Phone and tablet cases, screen protectors and spare screens. Never swept
  // (wave -1: a "case" sweep would bring in every cheap cover there is); the
  // ones other sweeps find are filed here whichever sweep found them
  // (ListingProcessor.homeCategory), so each is created once. No term
  // contains "phone" or "mobile": site search matches a query inside stored
  // terms, and "phone" would then match every case.
  { ...original('phone-accessories', 'Phone Accessories', 'إكسسوارات موبايل', ['screen protector', 'tempered glass', 'جراب', 'اسكرينة']), rolloutWave: -1 },

  // ─── Large appliances ─────────────────────────────────────────────────
  group('large-appliances', 'Large Appliances', 'أجهزة منزلية كبيرة'),
  leaf('large-appliances', 1, 'refrigerators', 'Refrigerators', 'ثلاجات', ['refrigerator', 'fridge', 'side by side refrigerator', 'no frost refrigerator', 'fridge freezer', 'freezer at bottom', 'bottom freezer', 'ثلاجة', 'تلاجة']),
  leaf('large-appliances', 1, 'washing-machines', 'Washing Machines', 'غسالات ملابس', ['washing machine', 'front load washer', 'top load washer', 'washer dryer', 'washer', 'غسالة ملابس', 'غسالة']),
  leaf('large-appliances', 1, 'dishwashers', 'Dishwashers', 'غسالات أطباق', ['dishwasher', 'built-in dishwasher', 'freestanding dishwasher', 'dish washer', 'غسالة أطباق']),
  leaf('large-appliances', 1, 'cookers', 'Cookers', 'بوتاجازات', ['cooker', 'gas cooker', 'gas stove', 'freestanding cooker', 'stove', 'gas range', 'بوتاجاز', 'بوتجاز']),
  leaf('large-appliances', 1, 'freezers', 'Freezers', 'فريزرات', ['freezer', 'deep freezer', 'chest freezer', 'upright freezer', 'ديب فريزر', 'فريزر']),
  leaf('large-appliances', 2, 'clothes-dryers', 'Clothes Dryers', 'مجففات ملابس', ['clothes dryer', 'tumble dryer', 'dryer machine', 'مجفف ملابس', 'نشافة']),
  leaf('large-appliances', 2, 'built-in-ovens', 'Built-in Ovens', 'أفران بلت إن', ['built-in oven', 'electric oven', 'wall oven', 'built-in gas oven', 'gas oven', 'فرن بلت إن']),
  leaf('large-appliances', 2, 'built-in-hobs', 'Built-in Hobs', 'مسطحات طهي', ['built-in hob', 'gas hob', 'induction hob', 'ceramic hob', 'مسطح غاز']),
  leaf('large-appliances', 2, 'cooker-hoods', 'Cooker Hoods', 'شفاطات مطبخ', ['cooker hood', 'kitchen hood', 'range hood', 'chimney hood', 'شفاط مطبخ']),
  leaf('large-appliances', 3, 'water-dispensers', 'Water Dispensers', 'مبردات مياه', ['water dispenser', 'water cooler', 'hot and cold dispenser', 'مبرد مياه', 'كولدير']),
  leaf('large-appliances', 3, 'wine-coolers', 'Wine & Beverage Coolers', 'ثلاجات مشروبات', ['beverage cooler', 'wine cooler', 'wine fridge', 'mini fridge', 'ثلاجة مشروبات']),

  // ─── Climate and water ────────────────────────────────────────────────
  group('climate', 'Climate & Water', 'تكييف وتدفئة ومياه'),
  leaf('climate', 1, 'air-conditioners', 'Air Conditioners', 'تكييفات', ['air conditioner', 'split air conditioner', 'inverter ac', 'ac unit', 'تكييف', 'مكيف']),
  leaf('climate', 1, 'water-heaters', 'Water Heaters', 'سخانات مياه', ['water heater', 'electric water heater', 'gas water heater', 'instant water heater', 'سخان', 'سخان مياه']),
  leaf('climate', 2, 'portable-air-conditioners', 'Portable Air Conditioners', 'تكييفات متنقلة', ['portable air conditioner', 'portable ac', 'mobile air conditioner', 'تكييف متنقل']),
  leaf('climate', 2, 'water-filters', 'Water Filters', 'فلاتر مياه', ['water filter', 'reverse osmosis', 'water purifier', 'ro system', 'فلتر مياه']),
  leaf('climate', 3, 'air-purifiers', 'Air Purifiers', 'منقيات هواء', ['air purifier', 'hepa purifier', 'air cleaner', 'منقي هواء']),
  leaf('climate', 3, 'heaters', 'Heaters', 'دفايات', ['heater', 'oil heater', 'electric heater', 'fan heater', 'دفاية']),
  leaf('climate', 3, 'dehumidifiers', 'Dehumidifiers & Humidifiers', 'أجهزة ترطيب وإزالة رطوبة', ['dehumidifier', 'humidifier', 'air humidifier', 'مزيل رطوبة']),
  leaf('climate', 4, 'fans', 'Fans & Air Coolers', 'مراوح ومبردات هواء', ['air cooler', 'stand fan', 'ceiling fan', 'tower fan', 'مروحة', 'مبرد هواء']),

  // ─── Kitchen appliances ───────────────────────────────────────────────
  group('kitchen-appliances', 'Kitchen Appliances', 'أجهزة المطبخ'),
  leaf('kitchen-appliances', 1, 'coffee-machines', 'Coffee Machines', 'ماكينات قهوة', ['espresso machine', 'coffee machine', 'bean to cup coffee', 'coffee maker', 'coffee grinder', 'ماكينة قهوة', 'ماكينة اسبريسو']),
  leaf('kitchen-appliances', 2, 'microwaves', 'Microwaves', 'ميكروويف', ['microwave', 'microwave oven', 'solo microwave', 'grill microwave', 'ميكرويف']),
  leaf('kitchen-appliances', 2, 'air-fryers', 'Air Fryers', 'قلايات هوائية', ['air fryer', 'digital air fryer', 'dual basket air fryer', 'airfryer', 'deep fryer', 'fryer', 'قلاية هوائية', 'اير فراير']),
  leaf('kitchen-appliances', 2, 'stand-mixers', 'Stand Mixers', 'عجانات', ['stand mixer', 'kitchen machine', 'dough mixer', 'عجان', 'عجانة']),
  leaf('kitchen-appliances', 2, 'food-processors', 'Food Processors', 'محضرات طعام', ['food processor', 'kitchen robot', 'multi processor', 'food chopper', 'chopper', 'meat grinder', 'meat mincer', 'mincer', 'محضر طعام', 'كبة']),
  leaf('kitchen-appliances', 3, 'electric-ovens', 'Electric Countertop Ovens', 'أفران كهربائية', ['countertop oven', 'toaster oven', 'mini oven', 'فرن كهربائي']),
  leaf('kitchen-appliances', 3, 'blenders', 'Blenders', 'خلاطات', ['blender', 'high speed blender', 'countertop blender', 'خلاط']),
  leaf('kitchen-appliances', 3, 'juicers', 'Juicers', 'عصارات', ['juicer', 'slow juicer', 'cold press juicer', 'citrus juicer', 'عصارة']),
  leaf('kitchen-appliances', 3, 'multicookers', 'Multicookers & Pressure Cookers', 'حلل ضغط كهربائية', ['multicooker', 'electric pressure cooker', 'instant pot', 'rice cooker', 'حلة ضغط كهربائية']),
  leaf('kitchen-appliances', 4, 'grills', 'Electric Grills', 'شوايات كهربائية', ['electric grill', 'contact grill', 'indoor grill', 'raclette grill', 'grill', 'health grill', 'grill maker', 'شواية كهربائية']),
  leaf('kitchen-appliances', 4, 'snack-makers', 'Waffle, Sandwich & Snack Makers', 'صانعات الوافل والسندوتشات', ['waffle maker', 'waffel maker', 'sandwich maker', 'popcorn maker', 'egg cooker', 'egg boiler', 'donut maker', 'crepe maker', 'yogurt maker', 'صانعة وافل']),
  leaf('kitchen-appliances', 4, 'kettles-toasters', 'Kettles & Toasters', 'غلايات ومحمصات', ['electric kettle', 'toaster', 'breakfast set', 'غلاية', 'محمصة']),
  leaf('kitchen-appliances', 4, 'cookware', 'Cookware Sets', 'أطقم حلل', ['cookware set', 'granite cookware', 'stainless steel cookware', 'pots and pans set', 'طقم حلل']),

  // ─── Home care and personal care ──────────────────────────────────────
  group('home-care', 'Home Care', 'العناية بالمنزل'),
  leaf('home-care', 2, 'robot-vacuums', 'Robot Vacuums', 'مكانس روبوت', ['robot vacuum', 'robotic vacuum cleaner', 'robot mop', 'مكنسة روبوت']),
  leaf('home-care', 2, 'vacuum-cleaners', 'Vacuum Cleaners', 'مكانس كهربائية', ['vacuum cleaner', 'canister vacuum', 'bagless vacuum', 'wet and dry vacuum', 'carpet cleaner', 'upholstery cleaner', 'spot cleaner', 'مكنسة كهربائية']),
  leaf('home-care', 2, 'cordless-vacuums', 'Cordless Stick Vacuums', 'مكانس لاسلكية', ['cordless vacuum', 'stick vacuum', 'handheld vacuum', 'مكنسة لاسلكية']),
  leaf('home-care', 3, 'steam-cleaners', 'Steam Cleaners & Irons', 'مكاوي ومنظفات بالبخار', ['steam iron', 'steam station', 'garment steamer', 'steam cleaner', 'steam mop', 'floor cleaner', 'مكواة بخار']),
  leaf('home-care', 3, 'sewing-machines', 'Sewing Machines', 'ماكينات خياطة', ['sewing machine', 'embroidery machine', 'overlock machine', 'ماكينة خياطة']),
  leaf('home-care', 4, 'pressure-washers', 'Pressure Washers', 'غسالات ضغط', ['pressure washer', 'high pressure cleaner', 'jet washer', 'مسدس ضغط مياه']),

  group('personal-care', 'Personal Care Devices', 'أجهزة العناية الشخصية'),
  leaf('personal-care', 2, 'hair-dryers', 'Hair Dryers & Stylers', 'مجففات وأجهزة تصفيف الشعر', ['hair dryer', 'hair styler', 'airwrap', 'hot air brush', 'سشوار']),
  leaf('personal-care', 3, 'shavers', 'Shavers & Trimmers', 'ماكينات حلاقة', ['electric shaver', 'beard trimmer', 'body groomer', 'ماكينة حلاقة']),
  leaf('personal-care', 3, 'hair-removal', 'IPL & Hair Removal', 'أجهزة إزالة الشعر', ['ipl hair removal', 'laser hair removal', 'epilator', 'wax heater', 'wax warmer', 'جهاز ليزر إزالة الشعر']),
  leaf('personal-care', 3, 'hair-straighteners', 'Hair Straighteners & Curlers', 'مكواة شعر', ['hair straightener', 'flat iron', 'hair curler', 'مكواة شعر']),
  leaf('personal-care', 4, 'electric-toothbrushes', 'Electric Toothbrushes', 'فرش أسنان كهربائية', ['electric toothbrush', 'sonic toothbrush', 'water flosser', 'فرشاة أسنان كهربائية']),

  group('health', 'Health Devices', 'أجهزة صحية'),
  leaf('health', 2, 'massage-chairs', 'Massage Chairs & Massagers', 'كراسي وأجهزة تدليك', ['massage chair', 'massage gun', 'foot massager', 'neck massager', 'كرسي مساج', 'جهاز مساج']),
  leaf('health', 3, 'blood-pressure-monitors', 'Blood Pressure & Glucose Monitors', 'أجهزة ضغط وسكر', ['blood pressure monitor', 'glucose meter', 'pulse oximeter', 'جهاز ضغط', 'جهاز سكر']),
  leaf('health', 3, 'mobility-aids', 'Mobility Aids', 'مساعدات الحركة', ['wheelchair', 'electric wheelchair', 'mobility scooter', 'walker rollator', 'كرسي متحرك']),
  leaf('health', 4, 'hearing-aids', 'Hearing Aids', 'سماعات طبية', ['hearing aid', 'hearing amplifier', 'rechargeable hearing aid', 'سماعة طبية']),
  leaf('health', 4, 'smart-scales', 'Smart Scales', 'موازين ذكية', ['smart scale', 'body composition scale', 'bathroom scale', 'ميزان ذكي']),

  // ─── Computing, office and networking ─────────────────────────────────
  group('computing', 'Computing & Office', 'كمبيوتر ومكتب'),
  leaf('computing', 2, 'desktop-pcs', 'Desktop PCs', 'أجهزة كمبيوتر مكتبي', ['desktop pc', 'gaming pc', 'desktop computer', 'mini pc', 'كمبيوتر مكتبي']),
  leaf('computing', 2, 'all-in-one-pcs', 'All-in-One PCs', 'كمبيوتر متكامل', ['all in one pc', 'all-in-one computer', 'imac', 'كمبيوتر اول ان ون']),
  leaf('computing', 2, 'printers', 'Printers', 'طابعات', ['printer', 'laser printer', 'ink tank printer', 'multifunction printer', 'طابعة']),
  leaf('computing', 2, 'projectors', 'Projectors', 'بروجكتور', ['projector', 'home theater projector', '4k projector', 'data show', 'بروجيكتور', 'داتا شو']),
  leaf('computing', 3, 'motherboards', 'Motherboards', 'مازربورد', ['motherboard', 'gaming motherboard', 'atx motherboard', 'ماذربورد']),
  leaf('computing', 3, 'ssds-storage', 'SSDs & Storage', 'وحدات تخزين', ['nvme ssd', 'sata ssd', 'external hard drive', 'nas storage', 'هارد ديسك']),
  leaf('computing', 3, 'memory-ram', 'Memory (RAM)', 'رامات', ['ddr5 ram', 'laptop ram', 'ddr4 ram', 'desktop memory', 'رامات']),
  leaf('computing', 3, 'power-supplies', 'PC Power Supplies & Cases', 'باور سبلاي وكيسات', ['power supply', 'psu', 'pc case', 'computer case', 'باور سبلاي']),
  leaf('computing', 3, 'ups', 'UPS & Power Backup', 'أجهزة UPS', ['ups', 'uninterruptible power supply', 'power backup', 'يو بي اس']),
  leaf('computing', 4, 'scanners', 'Scanners', 'ماسحات ضوئية', ['scanner', 'document scanner', 'photo scanner', 'سكانر']),
  leaf('computing', 4, 'office-chairs', 'Office & Gaming Chairs', 'كراسي مكتب وجيمنج', ['office chair', 'gaming chair', 'ergonomic chair', 'كرسي مكتب', 'كرسي جيمنج']),
  leaf('computing', 4, 'desks', 'Computer & Standing Desks', 'مكاتب كمبيوتر', ['standing desk', 'computer desk', 'gaming desk', 'مكتب كمبيوتر']),
  leaf('computing', 4, 'keyboards-mice', 'Premium Keyboards & Mice', 'كيبورد وماوس', ['mechanical keyboard', 'gaming keyboard', 'gaming mouse', 'keyboard mouse combo', 'كيبورد']),

  group('networking', 'Networking & Smart Home', 'شبكات ومنزل ذكي'),
  leaf('networking', 3, 'routers', 'Routers & Mesh Wi-Fi', 'راوترات', ['router', 'mesh wifi', 'wifi 6 router', '4g router', 'راوتر']),
  leaf('networking', 3, 'security-cameras', 'Security Cameras', 'كاميرات مراقبة', ['security camera', 'cctv', 'ip camera', 'nvr kit', 'كاميرا مراقبة']),
  leaf('networking', 3, 'smart-locks', 'Smart Locks & Doorbells', 'أقفال ذكية', ['smart lock', 'video doorbell', 'fingerprint door lock', 'قفل ذكي']),
  leaf('networking', 4, 'smart-speakers', 'Smart Speakers & Displays', 'سماعات ذكية', ['smart speaker', 'smart display', 'echo show', 'سماعة ذكية']),
  leaf('networking', 4, 'network-storage', 'Network Switches & Access Points', 'سويتشات وأكسس بوينت', ['network switch', 'access point', 'poe switch', 'سويتش شبكة']),

  // ─── Cameras, audio and gaming ────────────────────────────────────────
  group('cameras', 'Cameras & Drones', 'كاميرات ودرونز'),
  leaf('cameras', 1, 'digital-cameras', 'Digital Cameras', 'كاميرات ديجيتال', ['mirrorless camera', 'dslr camera', 'digital camera', 'camera body', 'camera', 'كاميرا ديجيتال', 'كاميرا']),
  leaf('cameras', 2, 'camera-lenses', 'Camera Lenses', 'عدسات كاميرات', ['camera lens', 'prime lens', 'zoom lens', 'telephoto lens', 'عدسة كاميرا']),
  leaf('cameras', 2, 'drones', 'Drones', 'درونز', ['drone', 'camera drone', 'quadcopter', 'fpv drone', 'درون']),
  leaf('cameras', 2, 'action-cameras', 'Action Cameras', 'كاميرات أكشن', ['action camera', 'gopro', '360 camera', 'كاميرا أكشن']),
  leaf('cameras', 3, 'camcorders', 'Camcorders & Cinema Cameras', 'كاميرات فيديو', ['camcorder', 'video camera', 'cinema camera', 'كاميرا فيديو']),
  leaf('cameras', 3, 'gimbals', 'Gimbals & Stabilizers', 'جيمبال', ['gimbal', 'camera stabilizer', 'phone gimbal', 'جيمبل']),
  leaf('cameras', 4, 'studio-lighting', 'Studio Lighting', 'إضاءة تصوير', ['studio light', 'ring light', 'softbox kit', 'led video light', 'إضاءة تصوير']),
  leaf('cameras', 4, 'instant-cameras', 'Instant Cameras & Printers', 'كاميرات فورية', ['instant camera', 'instax', 'photo printer', 'كاميرا فورية']),

  group('audio', 'Audio & Home Theater', 'صوتيات ومسرح منزلي'),
  leaf('audio', 1, 'soundbars', 'Soundbars', 'ساوند بار', ['soundbar', 'sound bar', 'dolby atmos soundbar', 'ساوندبار']),
  leaf('audio', 2, 'home-theater', 'Home Theater Systems', 'مسرح منزلي', ['home theater', 'home cinema system', 'av receiver', 'مسرح منزلي']),
  leaf('audio', 2, 'speakers', 'Speakers', 'مكبرات صوت', ['bluetooth speaker', 'party speaker', 'portable speaker', 'bookshelf speakers', 'سماعة بلوتوث', 'سبيكر']),
  leaf('audio', 3, 'hifi', 'Hi-Fi & Turntables', 'هاي فاي', ['turntable', 'record player', 'stereo amplifier', 'hi-fi system', 'مشغل أسطوانات']),
  leaf('audio', 3, 'microphones', 'Microphones & Audio Interfaces', 'ميكروفونات', ['microphone', 'condenser microphone', 'audio interface', 'wireless microphone', 'ميكروفون', 'مايك']),
  leaf('audio', 4, 'dj-equipment', 'DJ Equipment', 'معدات دي جي', ['dj controller', 'dj mixer', 'studio monitors', 'دي جي']),

  group('gaming', 'Gaming', 'ألعاب الفيديو'),
  leaf('gaming', 2, 'vr-headsets', 'VR Headsets', 'نظارات واقع افتراضي', ['vr headset', 'virtual reality headset', 'meta quest', 'نظارة vr', 'نظارة واقع افتراضي']),
  leaf('gaming', 2, 'handheld-consoles', 'Handheld Gaming PCs', 'أجهزة ألعاب محمولة', ['handheld gaming pc', 'steam deck', 'rog ally', 'legion go', 'جهاز ألعاب محمول']),
  leaf('gaming', 3, 'gaming-accessories', 'Racing Wheels & Controllers', 'دركسيون وأذرع تحكم', ['racing wheel', 'gaming controller', 'flight stick', 'دركسيون', 'دراع تحكم']),
  leaf('gaming', 4, 'video-games', 'Video Games', 'ألعاب فيديو', ['video game', 'ps5 game', 'nintendo switch game', 'لعبة بلايستيشن']),

  // ─── Furniture and home ───────────────────────────────────────────────
  group('furniture', 'Furniture', 'أثاث'),
  leaf('furniture', 1, 'sofas', 'Sofas', 'كنب', ['sofa', 'sofa bed', 'corner sofa', 'couch', 'كنبة', 'انترية']),
  leaf('furniture', 1, 'mattresses', 'Mattresses', 'مراتب', ['mattress', 'orthopedic mattress', 'pocket spring mattress', 'memory foam mattress', 'مرتبة']),
  leaf('furniture', 2, 'beds', 'Beds & Bedroom Sets', 'سراير وغرف نوم', ['bed frame', 'bedroom set', 'double bed', 'upholstered bed', 'سرير', 'غرفة نوم']),
  leaf('furniture', 2, 'wardrobes', 'Wardrobes', 'دواليب', ['wardrobe', 'closet', 'sliding wardrobe', 'دولاب']),
  leaf('furniture', 2, 'dining-sets', 'Dining Sets', 'سفرة', ['dining table', 'dining set', 'dining chairs', 'سفرة', 'ترابيزة سفرة']),
  leaf('furniture', 3, 'tv-units', 'TV Units & Storage', 'مكتبات تلفزيون', ['tv unit', 'tv stand', 'media console', 'مكتبة تلفزيون']),
  leaf('furniture', 3, 'recliners', 'Recliners & Armchairs', 'كراسي ريكلاينر', ['recliner', 'armchair', 'lazy boy chair', 'كرسي ريكلاينر', 'فوتيه']),
  leaf('furniture', 3, 'outdoor-furniture', 'Outdoor Furniture', 'أثاث خارجي', ['outdoor furniture', 'garden furniture', 'patio set', 'أثاث حدائق']),
  leaf('furniture', 4, 'kids-furniture', 'Kids Furniture', 'أثاث أطفال', ['kids bed', 'bunk bed', 'kids bedroom', 'سرير أطفال']),
  leaf('furniture', 4, 'shelving', 'Bookcases & Shelving', 'مكتبات ورفوف', ['bookcase', 'shelving unit', 'display cabinet', 'مكتبة كتب']),

  group('home-garden', 'Home & Garden', 'المنزل والحديقة'),
  leaf('home-garden', 3, 'carpets', 'Carpets & Rugs', 'سجاد', ['carpet', 'rug', 'area rug', 'persian rug', 'سجادة', 'سجاد']),
  leaf('home-garden', 3, 'lighting', 'Lighting & Chandeliers', 'نجف وإضاءة', ['chandelier', 'ceiling light', 'floor lamp', 'نجفة', 'اباليك']),
  leaf('home-garden', 3, 'lawn-mowers', 'Lawn Mowers & Garden Power Tools', 'ماكينات قص العشب', ['lawn mower', 'hedge trimmer', 'grass trimmer', 'ماكينة قص الحشائش']),
  leaf('home-garden', 3, 'bbq-grills', 'BBQ & Outdoor Grills', 'شوايات خارجية', ['bbq grill', 'charcoal grill', 'gas grill', 'شواية فحم']),
  leaf('home-garden', 4, 'bedding', 'Bedding Sets', 'مفارش', ['bedding set', 'duvet', 'comforter set', 'مفرش سرير', 'لحاف']),
  leaf('home-garden', 4, 'curtains', 'Curtains & Blinds', 'ستائر', ['curtains', 'blackout curtains', 'roller blinds', 'ستارة', 'ستائر']),
  leaf('home-garden', 4, 'dinnerware', 'Dinnerware Sets', 'أطقم سفرة', ['dinnerware set', 'porcelain dinner set', 'cutlery set', 'طقم صيني', 'طقم سفرة']),
  leaf('home-garden', 4, 'solar-power', 'Solar Panels & Power Stations', 'طاقة شمسية', ['solar panel', 'portable power station', 'solar generator', 'inverter battery', 'لوح طاقة شمسية']),
  leaf('home-garden', 4, 'generators', 'Generators', 'مولدات كهرباء', ['generator', 'gasoline generator', 'diesel generator', 'مولد كهرباء']),

  // ─── Tools and automotive ─────────────────────────────────────────────
  group('tools', 'Tools & DIY', 'عدد وأدوات'),
  leaf('tools', 2, 'power-drills', 'Drills & Drivers', 'شنيور ومفكات', ['cordless drill', 'hammer drill', 'impact driver', 'rotary hammer', 'شنيور', 'دريل']),
  leaf('tools', 3, 'saws', 'Power Saws', 'مناشير كهربائية', ['circular saw', 'jigsaw', 'miter saw', 'chainsaw', 'منشار كهربائي']),
  leaf('tools', 3, 'grinders', 'Angle Grinders & Sanders', 'صواريخ وصنفرة', ['angle grinder', 'orbital sander', 'belt sander', 'صاروخ تقطيع']),
  leaf('tools', 3, 'tool-kits', 'Power Tool Kits', 'أطقم عدد', ['power tool kit', 'combo kit', 'tool set', 'mechanic tool set', 'شنطة عدة']),
  leaf('tools', 3, 'welding', 'Welding Machines', 'ماكينات لحام', ['welding machine', 'inverter welder', 'mig welder', 'ماكينة لحام']),
  leaf('tools', 4, 'air-compressors', 'Air Compressors', 'كمبروسر هواء', ['air compressor', 'tyre inflator', 'portable compressor', 'كمبروسر']),
  leaf('tools', 4, 'measuring-tools', 'Laser Levels & Measuring', 'أدوات قياس', ['laser level', 'laser distance meter', 'multimeter', 'ميزان ليزر']),

  group('automotive', 'Automotive', 'مستلزمات السيارات'),
  leaf('automotive', 2, 'car-tyres', 'Car Tyres', 'كاوتش سيارات', ['car tyre', 'car tire', 'all season tyre', 'كاوتش', 'اطار سيارة']),
  leaf('automotive', 2, 'car-electronics', 'Car Screens & Dash Cams', 'شاشات وكاميرات سيارات', ['car android screen', 'dash cam', 'carplay screen', 'reverse camera', 'شاشة سيارة']),
  leaf('automotive', 3, 'car-batteries', 'Car Batteries', 'بطاريات سيارات', ['car battery', 'agm battery', 'battery 70 amp', 'بطارية سيارة']),
  leaf('automotive', 3, 'car-audio', 'Car Audio', 'صوتيات سيارات', ['car speakers', 'car subwoofer', 'car amplifier', 'سماعات سيارة']),
  leaf('automotive', 4, 'motorcycle-gear', 'Motorcycles & Helmets', 'موتوسيكلات وخوذ', ['motorcycle', 'motorcycle helmet', 'riding jacket', 'موتوسيكل', 'خوذة']),

  // ─── Mobility, fitness and sports ─────────────────────────────────────
  group('mobility', 'Bikes & Scooters', 'دراجات وسكوترات'),
  leaf('mobility', 1, 'electric-scooters', 'Electric Scooters', 'سكوتر كهربائي', ['electric scooter', 'e-scooter', 'kick scooter electric', 'سكوتر كهرباء', 'سكوتر كهربائي']),
  leaf('mobility', 1, 'electric-bikes', 'Electric Bikes', 'دراجات كهربائية', ['electric bike', 'e-bike', 'ebike', 'electric bicycle', 'عجلة كهرباء', 'دراجة كهربائية']),
  leaf('mobility', 2, 'bicycles', 'Bicycles', 'دراجات', ['bicycle', 'mountain bike', 'road bike', 'city bike', 'عجلة', 'دراجة']),
  leaf('mobility', 3, 'hoverboards', 'Hoverboards & Unicycles', 'هوفربورد', ['hoverboard', 'self balancing scooter', 'electric unicycle', 'هوفر بورد']),

  group('fitness', 'Fitness', 'لياقة بدنية'),
  leaf('fitness', 1, 'treadmills', 'Treadmills', 'مشايات', ['treadmill', 'running machine', 'walking pad', 'folding treadmill', 'مشاية', 'تريدميل']),
  leaf('fitness', 2, 'exercise-bikes', 'Exercise Bikes', 'عجل ثابت', ['exercise bike', 'spin bike', 'stationary bike', 'recumbent bike', 'عجلة ثابتة']),
  leaf('fitness', 2, 'home-gyms', 'Home Gyms & Multi-stations', 'أجهزة جيم منزلي', ['home gym', 'multi gym', 'smith machine', 'power rack', 'جيم منزلي']),
  leaf('fitness', 3, 'ellipticals', 'Ellipticals & Rowers', 'أجهزة أوربتراك وتجديف', ['elliptical', 'cross trainer', 'rowing machine', 'اوربتراك', 'جهاز تجديف']),
  leaf('fitness', 3, 'weights', 'Dumbbells & Weight Sets', 'دمبلز وأوزان', ['adjustable dumbbells', 'dumbbell set', 'barbell set', 'weight plates', 'دمبل']),
  leaf('fitness', 4, 'weight-benches', 'Weight Benches', 'بنش تمارين', ['weight bench', 'adjustable bench', 'sit up bench', 'بنش']),

  group('sports-outdoor', 'Sports & Outdoor', 'رياضة وأنشطة خارجية'),
  leaf('sports-outdoor', 3, 'camping', 'Camping Gear', 'معدات تخييم', ['camping tent', 'sleeping bag', 'camping gear', 'خيمة']),
  leaf('sports-outdoor', 3, 'table-tennis', 'Table Tennis & Pool Tables', 'ترابيزات بينج بونج وبلياردو', ['table tennis table', 'ping pong table', 'pool table', 'foosball table', 'ترابيزة بينج بونج', 'بلياردو']),
  leaf('sports-outdoor', 4, 'golf', 'Golf Equipment', 'معدات جولف', ['golf clubs', 'golf set', 'golf bag', 'جولف']),
  leaf('sports-outdoor', 4, 'water-sports', 'Water Sports & Diving', 'رياضات مائية', ['paddle board', 'kayak', 'diving watch', 'snorkel set', 'قارب كاياك']),
  leaf('sports-outdoor', 4, 'trampolines', 'Trampolines & Playsets', 'ترامبولين', ['trampoline', 'swing set', 'playhouse', 'ترامبولين']),
  leaf('sports-outdoor', 4, 'binoculars', 'Binoculars & Telescopes', 'نظارات معظمة وتلسكوبات', ['binoculars', 'telescope', 'rangefinder', 'تلسكوب']),

  // ─── Baby, watches, fragrances, music, luggage ────────────────────────
  group('baby', 'Baby & Kids', 'الأطفال والرضع'),
  leaf('baby', 2, 'strollers', 'Strollers', 'عربيات أطفال', ['stroller', 'baby stroller', 'travel system', 'pram', 'عربية أطفال', 'عربة أطفال']),
  leaf('baby', 2, 'car-seats', 'Car Seats', 'كراسي سيارة للأطفال', ['car seat', 'baby car seat', 'booster seat', 'كرسي سيارة أطفال']),
  leaf('baby', 3, 'kids-ride-ons', 'Kids Electric Cars & Ride-ons', 'عربيات كهربائية للأطفال', ['kids electric car', 'ride on car', 'kids jeep', 'عربية كهربائية للأطفال']),
  leaf('baby', 3, 'baby-monitors', 'Baby Monitors', 'أجهزة مراقبة الأطفال', ['baby monitor', 'video baby monitor', 'baby camera', 'جهاز مراقبة أطفال']),
  leaf('baby', 4, 'cribs', 'Cribs & Playpens', 'سراير أطفال', ['baby crib', 'cot bed', 'playpen', 'مهد أطفال']),
  leaf('baby', 4, 'toys-lego', 'LEGO & Premium Toys', 'ليجو وألعاب', ['lego', 'lego technic', 'building set', 'ليجو']),

  group('watches-jewelry', 'Watches & Jewelry', 'ساعات ومجوهرات'),
  leaf('watches-jewelry', 2, 'watches', 'Watches', 'ساعات', ['wrist watch', 'automatic watch', 'chronograph watch', 'men watch', 'ساعة يد']),
  leaf('watches-jewelry', 3, 'jewelry', 'Gold & Jewelry', 'ذهب ومجوهرات', ['gold necklace', 'gold bracelet', 'diamond ring', 'gold ring', 'سلسلة ذهب', 'خاتم']),
  leaf('watches-jewelry', 4, 'sunglasses', 'Designer Sunglasses', 'نظارات شمس', ['sunglasses', 'ray-ban', 'polarized sunglasses', 'نظارة شمس']),
  leaf('watches-jewelry', 4, 'handbags', 'Designer Handbags', 'شنط يد', ['handbag', 'leather handbag', 'designer bag', 'crossbody bag', 'شنطة يد']),

  group('beauty', 'Fragrances & Beauty', 'عطور وتجميل'),
  leaf('beauty', 3, 'fragrances', 'Fragrances', 'عطور', ['perfume', 'eau de parfum', 'eau de toilette', 'fragrance gift set', 'برفان', 'عطر']),
  leaf('beauty', 4, 'skincare-devices', 'Skincare & Beauty Devices', 'أجهزة تجميل', ['facial cleansing brush', 'led face mask', 'microcurrent device', 'جهاز تنظيف البشرة']),

  group('music', 'Musical Instruments', 'آلات موسيقية'),
  leaf('music', 2, 'pianos-keyboards', 'Pianos & Keyboards', 'بيانو وأورج', ['digital piano', 'keyboard piano', 'synthesizer', 'midi keyboard', 'بيانو', 'اورج']),
  leaf('music', 3, 'guitars', 'Guitars', 'جيتار', ['acoustic guitar', 'electric guitar', 'bass guitar', 'guitar amplifier', 'جيتار']),
  leaf('music', 4, 'drums', 'Drums', 'درامز', ['drum kit', 'electronic drum', 'cajon', 'درامز']),
  leaf('music', 4, 'string-instruments', 'Violins & Ouds', 'كمان وعود', ['violin', 'oud', 'cello', 'كمان', 'عود']),

  group('travel', 'Luggage & Travel', 'شنط وسفر'),
  leaf('travel', 3, 'luggage', 'Luggage Sets', 'شنط سفر', ['luggage set', 'suitcase', 'trolley bag', 'hard shell luggage', 'شنطة سفر']),
  leaf('travel', 4, 'backpacks', 'Premium Backpacks', 'شنط ظهر', ['laptop backpack', 'travel backpack', 'camera backpack', 'شنطة ظهر']),
];
