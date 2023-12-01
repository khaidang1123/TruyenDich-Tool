const express = require('express');
const cheerio = require('cheerio');
const request = require('request-promise');
const fs = require('fs');
const speakingurl = require('speakingurl');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));


app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.post('/scrape', async (req, res) => {
    try {
        const url = req.body.url;
        let scrapeData = true;
        const data = [];
        const maxRetries = 10;
        let retryCount = 0;

        const dataBook = await request(url);
        const C$ = cheerio.load(dataBook);
        let book_name = C$('h3.title').text();

        if (book_name) {
            var index = 1;
            let bookID = ""
            const slug = speakingurl(book_name, { separator: '-' });
            let exist = false;

            const response = await fetch(`http://localhost:3001/api/books/${slug}`);
            const item = await response.json();

            fs.mkdirSync(`./data/${slug}`, { recursive: true });

            if (item && item.book) {
                // Existing book, get the last chapter number
                let last_chapter_number = Number(item.last_chapter[0].chapter_number);
                index = ++last_chapter_number;
                bookID = item.book._id
                exist = true
            } else {
                // New book, insert book data (add your logic here)
                bookID = mongoObjectId()
                const dataInsertBook = {
                    _id: {
                        "$oid": bookID
                    },
                    name: book_name,
                    image: C$('.book img').attr("src"),
                    description: C$('.desc-text').html(),
                    slug,
                    coins: 0,
                    is_public: false,
                    is_vip: false,
                    vip_from: 100,
                    is_full: false,
                    view: 1,
                    categories: []
                }

                data.push(dataInsertBook)
                fs.writeFileSync(`./data/${slug}/book.json`, JSON.stringify(data));
            }

            while (scrapeData) {
                try {
                    const html = await request(url + '/chuong-' + index);

                    if (!html) {
                        scrapeData = false;
                    } else {
                        const $ = cheerio.load(html);
                        const chapter_number = index;
                        const chapter_c = $('.chapter-c').html()
                        const chapter_content = $('<div>').html(chapter_c);
                        chapter_content.find("div").remove()

                        const chapter_title = $('.chapter-title').attr('title').replace(/.*Chương \d+: /, '').trim();
                        console.log(index)
                        
                        const dataInsertChapter = {
                            content: chapter_content.html(),
                            coins: 0,
                            views: 1,
                            book: {
                                "$oid": bookID
                            },
                            is_public: true,
                            title: chapter_title,
                            chapter_number
                        }

                        data.push(dataInsertChapter);

                        if (exist) {
                            fs.writeFileSync(`./data/${slug}/chapters-continue.json`, JSON.stringify(data));
                        } else {
                            fs.writeFileSync(`./data/${slug}/chapters.json`, JSON.stringify(data));
                        }
                    }

                    index++;
                    retryCount = 0;
                } catch (error) {
                    console.log("Lỗi kết nối... Đợi chút! Đang cào dữ liệu lại...")
                    retryCount++;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            if (retryCount === maxRetries) {
                res.status(500).send('Failed to scrape chapter data after multiple retries.');
            } else {
                res.status(200).send('Đã cào hết các chương. Kiểm tra file json để xem kết quả');
            }

        } else {
            res.send('URL không đúng hoặc không đọc được dữ liệu');
        }

    } catch (error) {
        console.error('Error scraping data:', error);
        res.status(500).send('Error scraping data.');
    }
});


function mongoObjectId() {
    var timestamp = (new Date().getTime() / 1000 | 0).toString(16);
    return timestamp + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function () {
        return (Math.random() * 16 | 0).toString(16);
    }).toLowerCase();
};

const port = 3005;
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
