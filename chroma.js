import { ChromaClient } from 'chromadb'
  async function chromaExample() {
    const client = new ChromaClient();
    const collection = await client.createCollection({name: "sample_collection"});
    await collection.add({
      documents: ["This is a document", "This is another document"], // we embed for you, or bring your own
      metadatas: [{ source: "my_source" }, { source: "my_source" }], // filter on arbitrary metadata!
      ids: ["id1", "id2"] // must be unique for each doc
    });
    const results = await collection.query({
      queryTexts: ["This is a query document"],
      nResults: 2,
      // where: {"metadata_field": "is_equal_to_this"}, // optional filter
      // whereDocument: {"$contains":"search_string"} // optional filter
    });
  }
  chromaExample();