import { transform } from './page.js';

export const useNotion = (key) => {
  const http = (method, endpoint, body) => {
    return fetch('https://api.notion.com/v1/' + endpoint, {
      method,
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${key}`,
        'Notion-Version': '2021-08-16',
        'Content-Type': 'application/json',
      },
    })
      .then((r) => r.json())
      .then((r) => r.results || r);
  };

  const fetchDatabase = async (id, body) => {
    const response = await http('POST', `databases/${id}/query`, body);
    return transform(response);
  };

  const fetchPage = async (id) => {
    const response = await http('GET', `pages/${id}`);
    return transform([response])[0];
  };

  const fethPageBySlug = async (database, slug) => {
    return fetchDatabase(database, {
      filter: {
        property: 'slug',
        rich_text: {
          equals: slug,
        },
      },
    });
  };

  const fetchBlocks = async (id) => {
    const blocks = await http('GET', `blocks/${id}/children?page_size=100`);
    let i = 0,
      response = [];
    for await (const block of blocks) {
      if (block.paragraph?.text[0]?.mention?.type === 'page') {
        block.page = await fetchPage(
          block.paragraph?.text[0]?.mention?.page.id
        );
      }
      if (block.type === 'bulleted_list_item') {
        response[i] = response[i] || { type: 'bulleted_list_item', items: [] };
        response[i].items.push(block.bulleted_list_item);
      } else {
        if (response[i]) i++;
        response[i] = block;
        i++;
      }
    }
    return response;
  };

  return { fetchDatabase, fetchPage, fethPageBySlug, fetchBlocks };
};
