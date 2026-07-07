// State nicknames, symbols, and road-trip trivia for the Map tab.
// Trivia order per state: [why it has its nickname, a famous person, a fun fact].

export interface StateFacts {
  nickname: string
  bird: string
  tree: string
  flower: string
  trivia: string[]
}

export const STATE_FACTS: Record<string, StateFacts> = {
  AL: {
    nickname: 'The Yellowhammer State',
    bird: 'Yellowhammer (Northern Flicker)',
    tree: 'Southern Longleaf Pine',
    flower: 'Camellia',
    trivia: [
      "Named for Civil War soldiers whose yellow-trimmed uniforms reminded people of the yellowhammer bird's flash of gold.",
      'Helen Keller was born in Tuscumbia, and civil-rights hero Rosa Parks was born in Tuskegee.',
      'Huntsville is "Rocket City" — the Saturn V moon rocket was developed there.',
    ],
  },
  AK: {
    nickname: 'The Last Frontier',
    bird: 'Willow Ptarmigan',
    tree: 'Sitka Spruce',
    flower: 'Forget-me-not',
    trivia: [
      'Called The Last Frontier for its vast, wild land — much of it still unreachable by road.',
      'The US bought Alaska from Russia in 1867 for about two cents an acre — critics called it "Seward\'s Folly."',
      "It's bigger than Texas, California, and Montana combined, and Denali is North America's tallest peak (20,310 ft).",
    ],
  },
  AZ: {
    nickname: 'The Grand Canyon State',
    bird: 'Cactus Wren',
    tree: 'Palo Verde',
    flower: 'Saguaro Cactus Blossom',
    trivia: [
      'Named for the Grand Canyon — 277 miles long and a mile deep, carved by the Colorado River.',
      "Sandra Day O'Connor, the first woman on the US Supreme Court, grew up on an Arizona ranch.",
      "Most of Arizona doesn't observe daylight saving time — the clocks never change.",
    ],
  },
  AR: {
    nickname: 'The Natural State',
    bird: 'Northern Mockingbird',
    tree: 'Loblolly Pine',
    flower: 'Apple Blossom',
    trivia: [
      'Called The Natural State for its mountains, hot springs, rivers, and forests.',
      'President Bill Clinton was born in Hope, Arkansas.',
      "Crater of Diamonds State Park is the world's only diamond mine where visitors keep what they dig up.",
    ],
  },
  CA: {
    nickname: 'The Golden State',
    bird: 'California Quail',
    tree: 'California Redwood',
    flower: 'California Poppy',
    trivia: [
      'Golden for the 1849 Gold Rush — plus its golden poppies and golden summer hills.',
      'President Richard Nixon was born in Yorba Linda, and Ronald Reagan was governor before becoming president.',
      'The General Sherman sequoia is the largest tree on Earth by volume.',
    ],
  },
  CO: {
    nickname: 'The Centennial State',
    bird: 'Lark Bunting',
    tree: 'Colorado Blue Spruce',
    flower: 'Rocky Mountain Columbine',
    trivia: [
      'Became a state in 1876 — exactly 100 years after the Declaration of Independence.',
      'Boxing legend Jack Dempsey, the "Manassa Mauler," was born in Manassa, Colorado.',
      'Colorado has more than 50 peaks over 14,000 feet — locals call them "fourteeners."',
    ],
  },
  CT: {
    nickname: 'The Constitution State',
    bird: 'American Robin',
    tree: 'White Oak',
    flower: 'Mountain Laurel',
    trivia: [
      "Its Fundamental Orders of 1639 are considered America's first written constitution.",
      'Mark Twain wrote Tom Sawyer and Huckleberry Finn at his home in Hartford.',
      "Louis' Lunch in New Haven claims to have served America's first hamburger, back in 1900.",
    ],
  },
  DE: {
    nickname: 'The First State',
    bird: 'Delaware Blue Hen',
    tree: 'American Holly',
    flower: 'Peach Blossom',
    trivia: [
      'First because it was the first state to ratify the US Constitution, on December 7, 1787.',
      'President Joe Biden grew up in Wilmington and represented Delaware in the Senate for 36 years.',
      "Delaware has no sales tax — everything costs exactly what the price tag says.",
    ],
  },
  FL: {
    nickname: 'The Sunshine State',
    bird: 'Northern Mockingbird',
    tree: 'Sabal Palm',
    flower: 'Orange Blossom',
    trivia: [
      'Named for its famously sunny weather — the sun shines most days of the year.',
      'Sidney Poitier, the first Black actor to win the Best Actor Oscar, was born in Miami.',
      'The Everglades is the only place on Earth where alligators and crocodiles live side by side.',
    ],
  },
  GA: {
    nickname: 'The Peach State',
    bird: 'Brown Thrasher',
    tree: 'Live Oak',
    flower: 'Cherokee Rose',
    trivia: [
      'Georgia growers made its sweet peaches famous across the country after the Civil War.',
      'President Jimmy Carter was born in Plains, and Dr. Martin Luther King Jr. was born in Atlanta.',
      'Coca-Cola was invented in Atlanta in 1886 by pharmacist John Pemberton.',
    ],
  },
  HI: {
    nickname: 'The Aloha State',
    bird: 'Nēnē (Hawaiian Goose)',
    tree: 'Kukui (Candlenut)',
    flower: 'Yellow Hibiscus',
    trivia: [
      '"Aloha" means love, hello, and goodbye — the aloha spirit is even written into state law.',
      'President Barack Obama was born in Honolulu.',
      "ʻIolani Palace in Honolulu is the only royal palace in the United States.",
    ],
  },
  ID: {
    nickname: 'The Gem State',
    bird: 'Mountain Bluebird',
    tree: 'Western White Pine',
    flower: 'Syringa',
    trivia: [
      'Nearly every kind of gemstone has been found here — including rare star garnets found almost nowhere else.',
      'Sacagawea, the legendary guide of the Lewis and Clark expedition, was born in what is now Idaho.',
      "Idaho grows about a third of America's potatoes.",
    ],
  },
  IL: {
    nickname: 'The Prairie State',
    bird: 'Northern Cardinal',
    tree: 'White Oak',
    flower: 'Violet',
    trivia: [
      'Named for the tallgrass prairies that once covered it — license plates also say "Land of Lincoln."',
      'Abraham Lincoln made his career here, and Ronald Reagan is the only president actually born in Illinois (Tampico).',
      "The world's first skyscraper went up in Chicago in 1885.",
    ],
  },
  IN: {
    nickname: 'The Hoosier State',
    bird: 'Northern Cardinal',
    tree: 'Tulip Tree',
    flower: 'Peony',
    trivia: [
      'Nobody knows for sure what "Hoosier" means — one theory says it comes from pioneers calling "Who\'s here?"',
      'Basketball great Larry Bird grew up in French Lick, Indiana.',
      "The Indianapolis 500 is the world's largest single-day sporting event.",
    ],
  },
  IA: {
    nickname: 'The Hawkeye State',
    bird: 'Eastern Goldfinch',
    tree: 'Oak',
    flower: 'Wild Prairie Rose',
    trivia: [
      'The nickname honors Chief Black Hawk, the famous Sauk leader.',
      'President Herbert Hoover was born in West Branch, Iowa.',
      'Pigs outnumber people in Iowa about seven to one.',
    ],
  },
  KS: {
    nickname: 'The Sunflower State',
    bird: 'Western Meadowlark',
    tree: 'Cottonwood',
    flower: 'Wild Sunflower',
    trivia: [
      'Named for the wild sunflowers that blanket its prairies every summer.',
      'Aviator Amelia Earhart was born in Atchison, and President Dwight Eisenhower grew up in Abilene.',
      'The geographic center of the lower 48 states is near Lebanon, Kansas.',
    ],
  },
  KY: {
    nickname: 'The Bluegrass State',
    bird: 'Northern Cardinal',
    tree: 'Tulip Poplar',
    flower: 'Goldenrod',
    trivia: [
      'Its famous pastures grow bluegrass, which shows a blue-purple tint when it blooms.',
      'Abraham Lincoln was born in a log cabin in Hodgenville, and boxing legend Muhammad Ali was from Louisville.',
      "Mammoth Cave is the longest known cave system on Earth — over 400 miles mapped so far.",
    ],
  },
  LA: {
    nickname: 'The Pelican State',
    bird: 'Brown Pelican',
    tree: 'Bald Cypress',
    flower: 'Magnolia',
    trivia: [
      'Named for the brown pelicans that cruise its Gulf coast — one is on the state flag feeding her chicks.',
      'Jazz legend Louis Armstrong was born and raised in New Orleans.',
      'Louisiana is the only state with parishes instead of counties, from its French and Spanish roots.',
    ],
  },
  ME: {
    nickname: 'The Pine Tree State',
    bird: 'Black-capped Chickadee',
    tree: 'Eastern White Pine',
    flower: 'White Pine Cone and Tassel',
    trivia: [
      'Named for the towering white pine forests that once masted the British navy.',
      'Author Stephen King was born in Portland and sets many of his stories in small-town Maine.',
      "Maine grows about 90% of America's wild blueberries and catches most of its lobster.",
    ],
  },
  MD: {
    nickname: 'The Old Line State',
    bird: 'Baltimore Oriole',
    tree: 'White Oak',
    flower: 'Black-eyed Susan',
    trivia: [
      'Honors the Maryland Line — Revolutionary War troops George Washington praised for holding the line.',
      'Freedom heroes Harriet Tubman and Frederick Douglass were both born on Maryland\'s Eastern Shore.',
      '"The Star-Spangled Banner" was written at Fort McHenry in Baltimore during the War of 1812.',
    ],
  },
  MA: {
    nickname: 'The Bay State',
    bird: 'Black-capped Chickadee',
    tree: 'American Elm',
    flower: 'Mayflower',
    trivia: [
      'Named for the Massachusetts Bay Colony, settled around its great bay in 1630.',
      'Four presidents were born here, including John F. Kennedy and John Adams.',
      'The Pilgrims held the first Thanksgiving in Plymouth in 1621, and basketball was invented in Springfield in 1891.',
    ],
  },
  MI: {
    nickname: 'The Great Lakes State',
    bird: 'American Robin',
    tree: 'Eastern White Pine',
    flower: 'Apple Blossom',
    trivia: [
      'It touches four of the five Great Lakes — no other state touches more.',
      'Henry Ford built his first car in Detroit, and President Gerald Ford grew up in Grand Rapids.',
      'Michigan has the longest freshwater coastline in the world — you\'re never more than 85 miles from a Great Lake.',
    ],
  },
  MN: {
    nickname: 'The North Star State',
    bird: 'Common Loon',
    tree: 'Norway Pine (Red Pine)',
    flower: 'Pink and White Lady\'s Slipper',
    trivia: [
      'From its French motto "L\'Étoile du Nord" — the Star of the North; it\'s also the Land of 10,000 Lakes (really 11,842).',
      'Music icon Prince was born in Minneapolis, and Judy Garland of The Wizard of Oz was from Grand Rapids, Minnesota.',
      'The mighty Mississippi River starts as a stream you can wade across at Lake Itasca.',
    ],
  },
  MS: {
    nickname: 'The Magnolia State',
    bird: 'Northern Mockingbird',
    tree: 'Magnolia',
    flower: 'Magnolia',
    trivia: [
      'Named for the sweet-smelling magnolia trees that bloom across the state — its tree AND flower.',
      'Elvis Presley was born in Tupelo, and Oprah Winfrey was born in Kosciusko.',
      'The teddy bear got its name after President Teddy Roosevelt spared a bear on a 1902 Mississippi hunt.',
    ],
  },
  MO: {
    nickname: 'The Show-Me State',
    bird: 'Eastern Bluebird',
    tree: 'Flowering Dogwood',
    flower: 'White Hawthorn Blossom',
    trivia: [
      'From Congressman Willard Vandiver\'s 1899 line: "Frothy eloquence neither convinces nor satisfies me... you have got to show me."',
      'President Harry Truman was born in Lamar, and Mark Twain grew up along the river in Hannibal.',
      'The Gateway Arch in St. Louis is America\'s tallest monument at 630 feet.',
    ],
  },
  MT: {
    nickname: 'The Treasure State',
    bird: 'Western Meadowlark',
    tree: 'Ponderosa Pine',
    flower: 'Bitterroot',
    trivia: [
      'Named for the gold, silver, and copper treasure pulled from its mountains — it\'s also Big Sky Country.',
      'Daredevil Evel Knievel was born in the mining town of Butte.',
      'At Glacier\'s Triple Divide Peak, rain can flow to the Pacific, the Atlantic, or Hudson Bay.',
    ],
  },
  NE: {
    nickname: 'The Cornhusker State',
    bird: 'Western Meadowlark',
    tree: 'Cottonwood',
    flower: 'Goldenrod',
    trivia: [
      'Named for the days when settlers husked corn by hand — now it\'s the university\'s team name too.',
      'President Gerald Ford was born in Omaha, and investor Warren Buffett still lives there.',
      'Kool-Aid was invented in Hastings, Nebraska, in 1927.',
    ],
  },
  NV: {
    nickname: 'The Silver State',
    bird: 'Mountain Bluebird',
    tree: 'Single-leaf Piñon',
    flower: 'Sagebrush',
    trivia: [
      'Named for the 1859 Comstock Lode, one of the richest silver strikes in history.',
      'Tennis champion Andre Agassi was born and raised in Las Vegas.',
      '"Nevada" means "snow-covered" in Spanish — surprising for a state that\'s mostly desert.',
    ],
  },
  NH: {
    nickname: 'The Granite State',
    bird: 'Purple Finch',
    tree: 'White Birch',
    flower: 'Purple Lilac',
    trivia: [
      'Named for its granite mountains and quarries — tough stone, tough people.',
      'Alan Shepard, the first American in space, was born in East Derry, New Hampshire.',
      'Mount Washington once recorded a 231-mph wind — among the fastest ever measured on Earth.',
    ],
  },
  NJ: {
    nickname: 'The Garden State',
    bird: 'Eastern Goldfinch',
    tree: 'Northern Red Oak',
    flower: 'Violet',
    trivia: [
      'Its farms fed New York and Philadelphia — an 1876 speech called it "an immense barrel filled with good things."',
      'Frank Sinatra was born in Hoboken, and Grover Cleveland is the only president born in New Jersey.',
      'Thomas Edison invented the light bulb and phonograph at his Menlo Park, NJ lab — and NJ has more diners than anywhere on Earth.',
    ],
  },
  NM: {
    nickname: 'Land of Enchantment',
    bird: 'Greater Roadrunner',
    tree: 'Piñon Pine',
    flower: 'Yucca',
    trivia: [
      'Named for its enchanting mix of desert light, mountains, and centuries-old pueblos.',
      'Apollo 17 moonwalker Harrison Schmitt was born in Santa Rita, New Mexico.',
      'The real Smokey Bear was a cub rescued from a New Mexico forest fire in 1950.',
    ],
  },
  NY: {
    nickname: 'The Empire State',
    bird: 'Eastern Bluebird',
    tree: 'Sugar Maple',
    flower: 'Rose',
    trivia: [
      'George Washington reportedly called New York "the seat of the empire" — the name stuck.',
      'Five presidents were born here, including both Roosevelts, Theodore and Franklin.',
      'Niagara Falls pours about 3,160 tons of water over its edge every second.',
    ],
  },
  NC: {
    nickname: 'The Tar Heel State',
    bird: 'Northern Cardinal',
    tree: 'Longleaf Pine',
    flower: 'Flowering Dogwood',
    trivia: [
      'Its pine forests produced tar and pitch — soldiers who "stuck" in battle were proudly called Tar Heels.',
      'President James K. Polk was born near Charlotte, and Michael Jordan grew up in Wilmington.',
      'The Wright brothers made the first airplane flight at Kitty Hawk in 1903.',
    ],
  },
  ND: {
    nickname: 'The Peace Garden State',
    bird: 'Western Meadowlark',
    tree: 'American Elm',
    flower: 'Wild Prairie Rose',
    trivia: [
      'Named for the International Peace Garden it shares with Canada on the Manitoba border.',
      'Teddy Roosevelt said he never would have been president without his ranching days in North Dakota.',
      'Rugby, North Dakota, marks the geographic center of North America.',
    ],
  },
  OH: {
    nickname: 'The Buckeye State',
    bird: 'Northern Cardinal',
    tree: 'Ohio Buckeye',
    flower: 'Scarlet Carnation',
    trivia: [
      'Named for its buckeye trees, whose shiny brown nuts look like a deer\'s eye.',
      'Seven presidents were born in Ohio, plus first-man-on-the-moon Neil Armstrong and the Wright brothers.',
      'The Cincinnati Red Stockings became baseball\'s first professional team in 1869.',
    ],
  },
  OK: {
    nickname: 'The Sooner State',
    bird: 'Scissor-tailed Flycatcher',
    tree: 'Eastern Redbud',
    flower: 'Oklahoma Rose',
    trivia: [
      '"Sooners" were settlers who snuck into the territory sooner than the official start of the great Land Run of 1889.',
      'Cowboy humorist Will Rogers and Olympic great Jim Thorpe were both born in Oklahoma.',
      'An oil well nicknamed "Petunia No. 1" once pumped oil right on the state capitol grounds.',
    ],
  },
  OR: {
    nickname: 'The Beaver State',
    bird: 'Western Meadowlark',
    tree: 'Douglas Fir',
    flower: 'Oregon Grape',
    trivia: [
      'Named for the beavers that drew fur trappers west — there\'s a beaver on the back of the state flag.',
      'Matt Groening, creator of The Simpsons, was born in Portland.',
      'Crater Lake is the deepest lake in the United States at 1,943 feet, formed in a collapsed volcano.',
    ],
  },
  PA: {
    nickname: 'The Keystone State',
    bird: 'Ruffed Grouse',
    tree: 'Eastern Hemlock',
    flower: 'Mountain Laurel',
    trivia: [
      'Like the center stone of an arch, Pennsylvania held the original 13 colonies together in the middle.',
      'President James Buchanan was born near Mercersburg, and Joe Biden was born in Scranton.',
      'Both the Declaration of Independence and the Constitution were signed in Philadelphia.',
    ],
  },
  RI: {
    nickname: 'The Ocean State',
    bird: 'Rhode Island Red',
    tree: 'Red Maple',
    flower: 'Violet',
    trivia: [
      'The smallest state still has over 400 miles of coastline — nowhere is more than a half hour from salt water.',
      'Gilbert Stuart, who painted the George Washington portrait on the $1 bill, was born here.',
      'Bristol, Rhode Island, has held its Fourth of July parade since 1785 — the nation\'s oldest.',
    ],
  },
  SC: {
    nickname: 'The Palmetto State',
    bird: 'Carolina Wren',
    tree: 'Sabal Palmetto',
    flower: 'Yellow Jessamine',
    trivia: [
      'In 1776, spongy palmetto logs at Fort Moultrie bounced British cannonballs — the tree earned its place on the flag.',
      'President Andrew Jackson was born in the Waxhaws region on the Carolinas border.',
      'The first shots of the Civil War were fired at Fort Sumter in Charleston Harbor.',
    ],
  },
  SD: {
    nickname: 'The Mount Rushmore State',
    bird: 'Ring-necked Pheasant',
    tree: 'Black Hills Spruce',
    flower: 'American Pasque',
    trivia: [
      'Named for the mountain carving of Washington, Jefferson, Roosevelt, and Lincoln in the Black Hills.',
      'Sitting Bull, the great Lakota leader, was born in what is now South Dakota.',
      'Rushmore took 14 years to carve — each president\'s face is about 60 feet tall.',
    ],
  },
  TN: {
    nickname: 'The Volunteer State',
    bird: 'Northern Mockingbird',
    tree: 'Tulip Poplar',
    flower: 'Iris',
    trivia: [
      'Earned in the War of 1812, when Tennessee volunteers answered the call and helped win the Battle of New Orleans.',
      'Dolly Parton was born in Sevierville, and Elvis made his home at Graceland in Memphis.',
      'Great Smoky Mountains is America\'s most-visited national park.',
    ],
  },
  TX: {
    nickname: 'The Lone Star State',
    bird: 'Northern Mockingbird',
    tree: 'Pecan',
    flower: 'Bluebonnet',
    trivia: [
      'The lone star comes from the flag of the Republic of Texas — its own independent country from 1836 to 1845.',
      'Presidents Dwight Eisenhower (Denison) and Lyndon B. Johnson (Stonewall) were born in Texas.',
      'Texas is bigger than France — remember the Alamo, and pack snacks for the drive.',
    ],
  },
  UT: {
    nickname: 'The Beehive State',
    bird: 'California Gull',
    tree: 'Quaking Aspen',
    flower: 'Sego Lily',
    trivia: [
      'The beehive was the pioneers\' symbol of hard work and everyone pulling together — it\'s on the flag and highway signs.',
      'Philo Farnsworth, inventor of electronic television, was born in Beaver, Utah.',
      'The Great Salt Lake is so salty you float like a cork, and Utah\'s "Mighty 5" national parks glow red.',
    ],
  },
  VT: {
    nickname: 'The Green Mountain State',
    bird: 'Hermit Thrush',
    tree: 'Sugar Maple',
    flower: 'Red Clover',
    trivia: [
      'From the French "verts monts" — green mountains — and Ethan Allen\'s Green Mountain Boys of the Revolution.',
      'President Calvin Coolidge was sworn in by his own father, by lamplight, at the family farmhouse in Plymouth Notch.',
      'Vermont makes more maple syrup than any other state — and billboards are banned to keep the views.',
    ],
  },
  VA: {
    nickname: 'The Old Dominion',
    bird: 'Northern Cardinal',
    tree: 'Flowering Dogwood',
    flower: 'American Dogwood',
    trivia: [
      'King Charles II honored loyal Virginia as his "old dominion" in the 1660s.',
      'Eight presidents were born here — more than any other state — including Washington, Jefferson, and Madison.',
      'Jamestown, founded in 1607, was the first permanent English settlement in America.',
    ],
  },
  WA: {
    nickname: 'The Evergreen State',
    bird: 'Willow Goldfinch',
    tree: 'Western Hemlock',
    flower: 'Coast Rhododendron',
    trivia: [
      'Named for forests so thick with firs and hemlocks they stay green all year.',
      'Microsoft founder Bill Gates and guitar legend Jimi Hendrix were both born in Seattle.',
      'It\'s the only state named after a president — and it grows more apples than any other.',
    ],
  },
  WV: {
    nickname: 'The Mountain State',
    bird: 'Northern Cardinal',
    tree: 'Sugar Maple',
    flower: 'Rhododendron',
    trivia: [
      'The whole state lies within the Appalachians — the most mountainous state east of the Mississippi.',
      'Chuck Yeager, the pilot who first broke the sound barrier, was born in Myra, West Virginia.',
      'It split from Virginia during the Civil War, becoming its own state in 1863.',
    ],
  },
  WI: {
    nickname: 'The Badger State',
    bird: 'American Robin',
    tree: 'Sugar Maple',
    flower: 'Wood Violet',
    trivia: [
      'Early lead miners dug into hillsides for winter shelter "like badgers" — the name stuck to the whole state.',
      'Painter Georgia O\'Keeffe was born in Sun Prairie, and Harry Houdini grew up in Appleton.',
      'Wisconsin makes about a quarter of all the cheese in America.',
    ],
  },
  WY: {
    nickname: 'The Equality State',
    bird: 'Western Meadowlark',
    tree: 'Plains Cottonwood',
    flower: 'Indian Paintbrush',
    trivia: [
      'First to let women vote (1869) and first to elect a woman governor — equality before anywhere else.',
      'Artist Jackson Pollock was born in Cody, the town founded by Buffalo Bill.',
      'Yellowstone became the world\'s first national park in 1872, and Devils Tower the first national monument.',
    ],
  },
}
