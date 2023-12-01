const express = require('express');
const cheerio = require('cheerio');
const request = require('request-promise');
const fs = require('fs');
const speakingurl = require('speakingurl');

const app = express();

app.use(express.urlencoded({ extended: true }));

const fixedUrl = 'https://truyenfull.vn/tu-cam-270192';

async function scrapeData() {
    try {
        const url = fixedUrl;
        let scrapeData = true;
        const data = [];
        const maxRetries = 10;
        let retryCount = 0;
        
        const dataBook = await request(url);
        const C$ = cheerio.load(dataBook);
        let book_name = C$('h3.title').text();
        
        if (book_name) {
            var index = 1;
            let bookID = "";
            const slug = speakingurl(book_name, { separator: '-' });
            let exist = false;
            let fixedChapterFrom = 0
            let dataChapter = []

            const response = await fetch(`http://localhost:3001/api/books/${slug}`);
            const item = await response.json();

            fs.mkdirSync(`./data/${slug}`, { recursive: true });

            if (item && item.book) {
                // Đã tồn tại book, chỉ cần cập nhật chương
                let last_chapter_number = Number(item.last_chapter[0].chapter_number);
                index = ++last_chapter_number;
                bookID = item.book._id
                exist = true
                fixedChapterFrom = index
            } else {
                // Chưa có book, cập nhật chương ngay
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

                        dataChapter.push(dataInsertChapter);

                        if (exist) {
                            fs.writeFileSync(`./data/${slug}/chapters-${fixedChapterFrom}.json`, JSON.stringify(dataChapter));
                        } else {
                            fs.writeFileSync(`./data/${slug}/chapters.json`, JSON.stringify(dataChapter));
                        }
                    }

                    index++;
                    retryCount = 0;
                } catch (error) {
                    console.log("Lỗi kết nối... Đợi chút! Đang cào dữ liệu lại...")
                    retryCount++;
                    if (retryCount == maxRetries) {
                        process.exit(1)
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // Cào xong...

        } else {
            process.exit(1)
        }

    } catch (error) {
        process.exit(1)
    }
}

function mongoObjectId() {
    var timestamp = (new Date().getTime() / 1000 | 0).toString(16);
    return timestamp + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function () {
        return (Math.random() * 16 | 0).toString(16);
    }).toLowerCase();
};

const port = 3005;
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
    
    scrapeData();
});
