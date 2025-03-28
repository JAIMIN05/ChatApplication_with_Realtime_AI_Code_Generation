import React, { useState, useEffect, useContext, useRef } from "react";
import { useLocation } from "react-router-dom";
import axios from "../config/axios.js";
import {
  initializeSocket,
  sendMessage,
  reciveMessage,
} from "../config/socket.js";
import { UserContext } from "../context/user.context.jsx";
import Markdown from "markdown-to-jsx";
import hljs from 'highlight.js';
import { getWebContainer } from "../config/webContainer.js";

function SyntaxHighlightedCode(props) {
  const ref = useRef(null);
  React.useEffect(() => {
    if (ref.current && props.className?.includes("lang-") && window.hljs) {
      window.hljs.highlightElement(ref.current);
      // hljs won't reprocess the element unless this attribute is removed
      ref.current.removeAttribute("data-highlighted");
    }
  }, [props.className, props.children]);
  return <code {...props} ref={ref} />;
}

const Project = () => {
  const location = useLocation();
  // console.log(location);

  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(new Set());
  const [project, setProject] = useState(location.state.project);
  const [message, setMessage] = useState("");
  const { user } = useContext(UserContext);
  const messageBox = React.createRef();

  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [fileTree, setFileTree] = useState({});

  const [currentFile, SetCurrentFile] = useState(null);
  const [openFile, setOpenFile] = useState([]);

  const [webContainer, setWebContainer] = useState(null);
  const [iframeUrl,setIframeUrl] = useState(null);
  const [runProcess, setRunProcess] = useState(null);

  const handleUserClick = (id) => {
    setSelectedUserId((prevSelectedUserId) => {
      const newSelectedUserId = new Set(prevSelectedUserId);
      if (newSelectedUserId.has(id)) {
        newSelectedUserId.delete(id);
      } else {
        newSelectedUserId.add(id);
      }
      // console.log(Array.from(newSelectedUserId));
      return newSelectedUserId;
    });
  };

  function refreshProjectData() {
    axios
      .get(`/projects/get-project/${project._id}`)
      .then((res) => {
        console.log("Refreshed project data:", res.data);
        // Update project state with the latest data
        setProject(res.data.project);
      })
      .catch((err) => {
        console.log("Error refreshing project data:", err.response?.data || err);
      });
  }

  function addCollaborators() {
    if (selectedUserId.size === 0) {
      alert("Please select at least one user to add as collaborator");
      return;
    }

    console.log("Adding collaborators:", Array.from(selectedUserId));
    
    axios
      .put("/projects/add-user", {
        projectId: project._id, // Use project._id directly
        users: Array.from(selectedUserId),
      })
      .then((res) => {
        console.log("Collaborators added successfully:", res.data);
        setIsModalOpen(false);
        setSelectedUserId(new Set()); // Clear selection
        // Refresh project data to get updated collaborators
        refreshProjectData();
      })
      .catch((err) => {
        console.log("Error adding collaborators:", err.response?.data || err);
        alert("Failed to add collaborators. Please try again.");
      });
  }

  const send = () => {
    if (!message.trim()) return; // Don't send empty messages

    sendMessage("project-message", {
      message,
      sender: user,
    });

    setMessages((prevMessages) => {
      // Ensure we're working with an array
      const currentMessages = Array.isArray(prevMessages) ? prevMessages : [];
      const newMessages = [...currentMessages, { sender: user, message }];
      // setTimeout(scrollToBottom, 0);
      return newMessages;
    });

    setMessage("");
  };

  function WriteAiMessage(message) {
    const messageObject = JSON.parse(message);

    return (
      <div className="overflow-auto bg-slate-950 text-white rounded-sm p-2">
        <Markdown
          children={messageObject.text}
          options={{
            overrides: {
              code: SyntaxHighlightedCode,
            },
          }}
        />
      </div>
    );
  }

  useEffect(() => {
    console.log("Initial project data:", project);
    
    // Initialize socket connection
    initializeSocket(project._id);
    
    // Setup web container
    if(!webContainer){
      getWebContainer().then(container => {
        setWebContainer(container);
        console.log("Container started");
      });
    }

    // Listen for messages
    reciveMessage("project-message", (data) => {
      console.log("Received message:", data);
      
      try {
        const message = JSON.parse(data.message);

        console.log("Parsed message:", message);

        if(webContainer && message.fileTree) {
          webContainer.mount(message.fileTree);
        }
        
        if(message.fileTree){
          setFileTree(message.fileTree);
        }
        
        setMessages((prevMessages) => [ ...prevMessages, data]);
      } catch (error) {
        console.log("Error processing message:", error);
        // Still add the message even if parsing fails
        setMessages((prevMessages) => [ ...prevMessages, data]);
      }
    });

    // Listen for user joined events
    reciveMessage("user-joined", (data) => {
      console.log("User joined:", data);
      // Refresh project data when a new user joins
      refreshProjectData();
    });

    // Get initial project data
    axios
      .get(`/projects/get-project/${project._id}`)
      .then((res) => {
        console.log("Project data:", res.data);
        setProject(res.data.project);
        
        // If fileTree exists in the response, set it
        if (res.data.project.fileTree) {
          setFileTree(res.data.project.fileTree);
        }
      })
      .catch((err) => {
        console.log("Error fetching project:", err.response?.data || err);
        // Handle error but don't overwrite fileTree if it doesn't exist
        if (err.response?.data?.project?.fileTree) {
          setFileTree(err.response.data.project.fileTree);
        }
      });

    // Get all users for collaborator selection
    axios
      .get("/users/all")
      .then((res) => {
        console.log("Available users:", res.data.users);
        setUsers(res.data.users);
      })
      .catch((err) => {
        console.log("Error fetching users:", err.response?.data || err);
      });

    // Cleanup function
    return () => {
      // Clean up socket listeners
      if (socketInstance) {
        socketInstance.off("project-message");
        socketInstance.off("user-joined");
      }
    };
  }, []);

  function saveFileTree(ft){
    axios.put('/projects/update-file-tree', {
      projectId: project._id,
      fileTree: ft
    }).then(res => {
      console.log(res.data);
    }).catch(err => {
      console.log(err);
    })
  }

  // function scrollToBottom() {
  //   messageBox.current.scrollTop = messageBox.current.scrollHeight;
  // }

  return (
    <main className="h-screen w-screen flex bg-[#0f172a]">
      {/* Left Section - Chat & Collaborators */}
      <section className="left relative flex flex-col h-screen min-w-96 bg-[#1e293b] border-r border-[#334155]">
        <header className="flex justify-between items-center p-2 px-4 w-full bg-[#334155] absolute top-0 z-10">
          <button
            className="flex items-center cursor-pointer hover:bg-[#475569] p-2 rounded text-[#e2e8f0] transition-colors"
            onClick={() => setIsModalOpen(true)}
          >
            <i className="ri-user-add-line mr-2"></i>
            <p>Add collaborator</p>
          </button>

          <button
            onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
            className="p-2 text-[#e2e8f0] hover:bg-[#475569] rounded transition-colors"
          >
            <i className="ri-group-fill"></i>
          </button>
        </header>

        {/* Side Panel for Collaborators (toggled by users icon) */}
        {isSidePanelOpen && (
          <div className="collaborators-panel absolute right-0 top-14 z-20 bg-[#1e293b] border border-[#334155] rounded-bl-lg shadow-lg w-64">
            <div className="p-3 border-b border-[#334155] flex justify-between items-center">
              <h3 className="text-[#e2e8f0] font-medium">Project Collaborators</h3>
              <button 
                onClick={() => refreshProjectData()} 
                className="text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
                title="Refresh collaborators list"
              >
                <i className="ri-refresh-line"></i>
              </button>
            </div>
            <div className="p-2 max-h-96 overflow-y-auto">
              {/* Show project owner first */}
              {project.owner && (
                <div className="flex items-center gap-2 p-2 text-[#e2e8f0] hover:bg-[#334155] rounded transition-colors">
                  <i className="ri-user-star-line text-[#3b82f6]"></i>
                  <span>{project.owner.email || "Project Owner"}</span>
                  <span className="ml-auto text-xs bg-[#3b82f6] px-2 py-0.5 rounded">Owner</span>
                </div>
              )}
              
              {/* Then show collaborators */}
              {project.users && project.users.length > 0 ? (
                project.users.map((collaborator, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 text-[#e2e8f0] hover:bg-[#334155] rounded transition-colors">
                    <i className="ri-user-line text-[#3b82f6]"></i>
                    <span>{typeof collaborator === 'object' ? collaborator.email : collaborator}</span>
                  </div>
                ))
              ) : (
                <p className="text-[#94a3b8] text-sm p-2">No collaborators yet</p>
              )}
            </div>
          </div>
        )}

        {/* Messages Area */}
        <div className="conversation-area pt-14 flex-grow flex flex-col h-full relative">
          <div ref={messageBox} 
            className="message-box p-3 flex-grow flex flex-col gap-3 overflow-auto max-h-full scrollbar-thin scrollbar-thumb-[#475569] scrollbar-track-[#1e293b]">
            {Array.isArray(messages) &&
              messages.map((msg, index) => (
                <div
                  key={index}
                  className={`${
                    msg.sender._id === "ai" ? "max-w-80" : "max-w-52"
                  } ${
                    msg.sender._id == user._id.toString() 
                      ? "ml-auto bg-[#3b82f6] text-white" 
                      : "bg-[#334155] text-[#e2e8f0]"
                  } message flex flex-col p-3 rounded-lg shadow-lg`}
                >
                  <small className="opacity-75 text-xs mb-1">{msg.sender.email}</small>
                  <div className="text-sm">
                    {msg.sender._id === "ai" ? WriteAiMessage(msg.message) : <p>{msg.message}</p>}
                  </div>
                </div>
              ))}
          </div>

          {/* Input Field */}
          <div className="inputField bg-[#334155] p-3 flex items-center gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="flex-grow p-2 px-4 bg-[#1e293b] text-[#e2e8f0] rounded-lg border border-[#475569] focus:outline-none focus:border-[#3b82f6] transition-colors"
              type="text"
              placeholder="Enter Message"
            />
            <button 
              onClick={send} 
              className="p-2 bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M1.94607 9.31543C1.42353 9.14125 1.4194 8.86022 1.95682 8.68108L21.043 2.31901C21.5715 2.14285 21.8746 2.43866 21.7265 2.95694L16.2733 22.0432C16.1223 22.5716 15.8177 22.59 15.5944 22.0876L11.9999 14L17.9999 6.00005L9.99992 12L1.94607 9.31543Z"></path>
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* Right Section - Code Editor */}
      <section className="right flex-grow h-full flex bg-[#0f172a]">
        {/* File Explorer */}
        <div className="explorer h-full w-64 bg-[#1e293b] border-r border-[#334155]">
          <div className="file-tree w-full p-2 space-y-1">
            {Object.keys(fileTree).map((file, index) => (
              <button
                key={index}
                onClick={() => {
                  SetCurrentFile(file);
                  setOpenFile([...new Set([...openFile, file])]);
                }}
                className="w-full p-2 flex items-center gap-2 rounded text-[#e2e8f0] hover:bg-[#334155] transition-colors"
              >
                <i className="ri-file-code-line text-[#3b82f6]"></i>
                <p className="font-medium">{file}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Code Editor */}
        <div className="code-editor flex flex-grow flex-col h-full">
          <div className="top flex justify-between items-center p-2 bg-[#1e293b] border-b border-[#334155]">
            <div className="files flex gap-1">
              {openFile.map((file, index) => (
                <button
                  key={index}
                  onClick={() => SetCurrentFile(file)}
                  className={`p-2 px-4 rounded-t flex items-center gap-2 transition-colors ${
                    currentFile === file
                      ? 'bg-[#334155] text-[#3b82f6]'
                      : 'bg-[#1e293b] text-[#94a3b8] hover:bg-[#334155]'
                  }`}
                >
                  <p className="font-medium text-sm">{file}</p>
                </button>
              ))}
            </div>

            <button
              onClick={async () => {
                await webContainer.mount(fileTree)

                const installProcess = await webContainer.spawn("npm", [ "install" ])

                installProcess.output.pipeTo(new WritableStream({
                  write(chunk){
                    console.log(chunk);
                  }
                }))

                if(runProcess){
                  runProcess.kill();
                }

                let tempRunProcess = await webContainer.spawn("npm", [ "start" ])

                tempRunProcess.output.pipeTo(new WritableStream({
                  write(chunk){
                    console.log(chunk);
                  }
                }))

                setRunProcess(tempRunProcess);

                webContainer.on('server-ready',(port,url) => {
                  console.log(port, url);
                  setIframeUrl(url);
                })
              }}
              className="px-4 py-2 bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors flex items-center gap-2"
            >
              <i className="ri-play-fill"></i>
              Run
            </button>
          </div>

          {/* Code Area */}
          <div className="flex-grow overflow-auto bg-[#0f172a]">
            {fileTree[currentFile] && (
              <div className="code-editor-area h-full">
                <pre className="h-full">
                  <code
                    className="language-javascript h-full block p-4 text-[#e2e8f0] outline-none"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const updatedContent = e.target.innerText;
                      const ft = {
                        ...fileTree,
                        [ currentFile ]: {
                          file: {
                            contents: updatedContent
                          }
                        }
                      }
                      setFileTree(ft)
                      saveFileTree(ft)
                    }}
                    dangerouslySetInnerHTML={{
                      __html: hljs.highlight(
                        'javascript',
                        fileTree[currentFile]?.contents || fileTree[currentFile]?.file?.contents || ''
                      ).value
                    }}
                    style={{
                      whiteSpace: 'pre-wrap',
                      paddingBottom: '25rem',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
                    }}
                  />
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Preview Panel */}
        {iframeUrl && webContainer && (
          <div className="flex min-w-96 flex-col h-full border-l border-[#334155]">
            <div className="address-bar p-2 bg-[#1e293b]">
              <input
                onChange={(e) => setIframeUrl(e.target.value)}
                type="text"
                value={iframeUrl}
                className="w-full p-2 px-4 bg-[#0f172a] text-[#e2e8f0] rounded border border-[#334155] focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
            <iframe src={iframeUrl} className="w-full h-full bg-white" />
          </div>
        )}
      </section>

      {/* Modal for adding collaborators */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-[#1e293b] w-96 rounded-lg shadow-xl border border-[#334155]">
            {/* Modal Header */}
            <div className="border-b border-[#334155] p-4">
              <h3 className="text-lg font-semibold text-[#e2e8f0]">Add Collaborators</h3>
            </div>

            {/* Modal Body */}
            <div className="p-4 max-h-96 overflow-y-auto">
              {users.length > 0 ? users.map((u) => (
                <div
                  key={u._id}
                  onClick={() => handleUserClick(u._id)}
                  className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                    selectedUserId.has(u._id)
                      ? "bg-[#3b82f6] text-white"
                      : "hover:bg-[#334155] text-[#e2e8f0]"
                  }`}
                >
                  <i className="ri-user-line"></i>
                  <span>{u.email}</span>
                  {selectedUserId.has(u._id) && (
                    <i className="ri-check-line ml-auto"></i>
                  )}
                </div>
              )) : (
                <p className="text-[#94a3b8] text-center">Loading users...</p>
              )}
              {users.length === 0 && (
                <button 
                  onClick={() => {
                    axios.get("/users/all")
                      .then(res => setUsers(res.data.users))
                      .catch(err => console.log(err));
                  }}
                  className="w-full p-2 text-[#3b82f6] hover:underline"
                >
                  Retry loading users
                </button>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-[#334155] p-4 flex justify-end gap-2">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-[#94a3b8] hover:text-[#e2e8f0] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addCollaborators}
                className="px-4 py-2 bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors"
              >
                Add Selected
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default Project;
