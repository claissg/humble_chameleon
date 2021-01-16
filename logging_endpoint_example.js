const fs = require('fs');
const got = require('got');
const fastify = require('fastify')({ logger: false })
const dateFormat = require('dateformat')
fastify.register(require('fastify-cookie'))

//catchall route
fastify.route({
  method: ['DELETE', 'GET', 'HEAD', 'PATCH', 'POST', 'PUT', 'OPTIONS'],
  url: '/*',
  handler: async function (request, reply) {
    const stream = fs.createReadStream('./resources/default_apache.html')
    reply.type('text/html').send(stream)
  }
})

//route to work with event data
fastify.route({
  method: ['POST'],
  url: '/create_event',
  handler: async function (request, reply) {
    if((typeof request.cookies['collection_cookie']) != 'undefined' & request.cookies['collection_cookie'] == 'karmaChameleon'){
      try {
        new_event = request.body
        //Add your custom handler here. This example simply prints events to the console
        console.log(dateFormat("isoDateTime"))
        console.log(new_event)
        reply.send("Successfully Saved Event")
      } catch(err) {
        console.log("problem with logging: " + err)
        reply.send("problem with logging: " + err)
      }
    }else{
      const stream = fs.createReadStream('./resources/default_apache.html')
      reply.type('text/html').send(stream)
    }
  }
})

// Run the server!
const start = async () => {
  fastify.listen(4005, (err) => {
    if (err) {
      fastify.log.error(err)
      process.exit(1)
    }
    console.log(`server listening on ${fastify.server.address().port}`)
  })
}
start()
